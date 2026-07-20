/**
 * Codebase Sync Module
 * Handles synchronization with upstream repository
 */

const { execSync } = require('child_process');
const logger = require('../../utils/logger');

const execAsync = (command, options = {}) => {
  try {
    return { 
      stdout: execSync(command, { 
        encoding: 'utf-8', 
        cwd: options.cwd || process.cwd(),
        timeout: options.timeout || 30000,
        ...options 
      }), 
      success: true 
    };
  } catch (error) {
    return { 
      stdout: error.stdout || '', 
      stderr: error.stderr || '',
      success: false, 
      error: error.message 
    };
  }
};

class CodebaseSyncService {
  constructor(config = {}) {
    this.config = config;
    this.syncConfig = config.codePlatform?.codebaseSync || {};
    this.localMainBranch = this.syncConfig.localMainBranch || 'main';
    this.upstreamBranch = this.syncConfig.upstreamBranch || 'main';
    this.syncStrategy = this.syncConfig.syncStrategy || 'merge';
  }

  isEnabled() {
    return this.syncConfig.enabled === true;
  }

  shouldSyncOnClaim() {
    return this.isEnabled() && this.syncConfig.autoSyncOnClaim === true;
  }

  shouldSyncOnCreate() {
    return this.isEnabled() && this.syncConfig.autoSyncOnCreate === true;
  }

  getUpstreamRemote() {
    const result = execAsync('git remote -v');
    if (!result.success) {
      logger.warn('Failed to get git remotes');
      return null;
    }

    const remotes = result.stdout;
    if (remotes.includes('upstream')) {
      return 'upstream';
    }

    const originMatch = remotes.match(/origin\s+.*\b(upstream|[^/]+\/[^/]+)\.git/);
    if (originMatch) {
      logger.debug(`Detected origin points to: ${originMatch[1]}`);
    }

    logger.warn('No upstream remote found, using origin');
    return 'origin';
  }

  async checkWorkingDirectoryClean() {
    const result = execAsync('git status --porcelain');
    const isClean = !result.stdout.trim();
    
    if (!isClean && this.syncConfig.requireCleanWorkingDir !== false) {
      logger.warn('Working directory has uncommitted changes');
    }
    
    return { clean: isClean, details: result.stdout };
  }

  async getCurrentBranch() {
    const result = execAsync('git branch --show-current');
    return result.success ? result.stdout.trim() : null;
  }

  async getUpstreamMainCommit() {
    const remote = this.getUpstreamRemote();
    if (!remote) return null;

    const result = execAsync(`git rev-parse ${remote}/${this.upstreamBranch}`);
    return result.success ? result.stdout.trim() : null;
  }

  async fetchUpstream() {
    const remote = this.getUpstreamRemote();
    if (!remote) {
      return { success: false, error: 'No upstream remote available' };
    }

    logger.debug(`Fetching from ${remote}...`);
    const result = execAsync(`git fetch ${remote} ${this.upstreamBranch}`);
    
    if (!result.success) {
      logger.warn(`Failed to fetch from ${remote}: ${result.error}`);
    }
    
    return result;
  }

  async syncUpstreamMain() {
    if (!this.isEnabled()) {
      return { success: true, message: 'Sync disabled', skipped: true };
    }

    const remote = this.getUpstreamRemote();
    if (!remote) {
      logger.warn('No upstream remote found, skipping sync');
      return { success: true, message: 'No upstream remote', skipped: true };
    }

    try {
      const currentBranch = await this.getCurrentBranch();
      const fromCommit = await this.getUpstreamMainCommit();

      if (currentBranch !== this.localMainBranch) {
        logger.debug(`Switching from ${currentBranch} to ${this.localMainBranch}`);
        const checkoutResult = execAsync(`git checkout ${this.localMainBranch}`);
        if (!checkoutResult.success) {
          return { 
            success: false, 
            error: `Failed to checkout ${this.localMainBranch}: ${checkoutResult.error}` 
          };
        }
      }

      const fetchResult = await this.fetchUpstream();
      if (!fetchResult.success) {
        return { success: false, error: fetchResult.error };
      }

      const syncCommand = this.syncStrategy === 'rebase' 
        ? `git rebase ${remote}/${this.upstreamBranch}`
        : `git pull ${remote} ${this.upstreamBranch}`;

      const syncResult = execAsync(syncCommand);

      if (!syncResult.success) {
        return {
          success: false,
          error: `Sync failed: ${syncResult.error}`,
          conflictDetected: syncResult.stderr.includes('conflict')
        };
      }

      const toCommit = await this.getUpstreamMainCommit();

      return {
        success: true,
        message: `Successfully synced with ${remote}/${this.upstreamBranch}`,
        fromCommit,
        toCommit,
        conflictDetected: false
      };
    } catch (error) {
      logger.error(`Sync error: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  async createFeatureBranchFromUpstream(featureBranchName) {
    if (!this.shouldSyncOnClaim()) {
      return { success: true, message: 'Sync on claim disabled', skipped: true };
    }

    const remote = this.getUpstreamRemote();
    if (!remote) {
      return { success: false, error: 'No upstream remote found' };
    }

    try {
      await this.syncUpstreamMain();

      const result = execAsync(`git checkout -b ${featureBranchName} ${remote}/${this.upstreamBranch}`);

      if (!result.success) {
        return { 
          success: false, 
          error: `Failed to create feature branch: ${result.error}` 
        };
      }

      logger.info(`Created branch ${featureBranchName} from ${remote}/${this.upstreamBranch}`);

      return {
        success: true,
        branch: featureBranchName,
        message: `Created branch ${featureBranchName} from ${remote}/${this.upstreamBranch}`
      };
    } catch (error) {
      logger.error(`Error creating feature branch: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  async verifyOnUpstreamMain() {
    const remote = this.getUpstreamRemote();
    if (!remote) return false;

    const currentBranch = await this.getCurrentBranch();
    if (currentBranch !== this.localMainBranch) {
      return false;
    }

    const localResult = execAsync('git rev-parse HEAD');
    const upstreamResult = execAsync(`git rev-parse ${remote}/${this.upstreamBranch}`);

    if (!localResult.success || !upstreamResult.success) {
      return false;
    }

    return localResult.stdout.trim() === upstreamResult.stdout.trim();
  }

  async getSyncStatus() {
    const remote = this.getUpstreamRemote();
    if (!remote) {
      return { available: false, reason: 'No upstream remote' };
    }

    const fetchResult = await this.fetchUpstream();
    if (!fetchResult.success) {
      return { available: false, reason: 'Failed to fetch' };
    }

    const currentBranch = await this.getCurrentBranch();
    const behindResult = execAsync(
      `git rev-list --count ${remote}/${this.upstreamBranch}...${currentBranch || 'HEAD'}`
    );

    const aheadResult = execAsync(
      `git rev-list --count ${currentBranch || 'HEAD'}...${remote}/${this.upstreamBranch}`
    );

    return {
      available: true,
      currentBranch,
      behind: parseInt(behindResult.stdout.trim() || '0', 10),
      ahead: parseInt(aheadResult.stdout.trim() || '0', 10),
      remote,
      upstreamBranch: this.upstreamBranch
    };
  }
}

module.exports = CodebaseSyncService;