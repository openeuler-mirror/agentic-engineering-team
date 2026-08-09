/**
 * StateStore - 基于磁盘文件的状态存储，替代内存变量实现跨进程状态共享
 *
 * xiaoO 专用模块（opencode 使用内存状态机，不需要磁盘持久化）。
 * 存储 currentCheckpointID、commandInfo、sessionID 等跨进程共享数据。
 */

'use strict';

const fs = require('fs');
const path = require('path');

class StateStore {
  constructor(projectRoot) {
    this.projectRoot = projectRoot;
    this.stateDir = path.join(projectRoot, '.aet', 'state');
    this.ensureStateDir();
  }

  ensureStateDir() {
    if (!fs.existsSync(this.stateDir)) {
      fs.mkdirSync(this.stateDir, { recursive: true });
    }
  }

  _readJson(filePath) {
    try {
      if (fs.existsSync(filePath)) {
        return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      }
    } catch (e) {
      // 静默处理
    }
    return null;
  }

  _writeJson(filePath, data) {
    try {
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
    } catch (e) {
      // 静默处理
    }
  }

  setCurrentCheckpointID(projectRoot, checkpointID) {
    const stateDir = path.join(projectRoot, '.aet', 'state');
    if (!fs.existsSync(stateDir)) {
      fs.mkdirSync(stateDir, { recursive: true });
    }
    this._writeJson(path.join(stateDir, 'current-checkpoint.json'), {
      checkpointID,
      updatedAt: new Date().toISOString(),
    });
  }

  getCurrentCheckpointID(projectRoot) {
    const root = projectRoot || this.projectRoot;
    const data = this._readJson(path.join(root, '.aet', 'state', 'current-checkpoint.json'));
    return data?.checkpointID || null;
  }

  clearCurrentCheckpointID(projectRoot) {
    const root = projectRoot || this.projectRoot;
    const filePath = path.join(root, '.aet', 'state', 'current-checkpoint.json');
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (e) {
      // 静默处理
    }
  }

  setCommandInfo(projectRoot, sessionId, commandInfo) {
    const stateDir = path.join(projectRoot, '.aet', 'state');
    if (!fs.existsSync(stateDir)) {
      fs.mkdirSync(stateDir, { recursive: true });
    }
    this._writeJson(path.join(stateDir, `cmd-info-${sessionId}.json`), {
      ...commandInfo,
      updatedAt: new Date().toISOString(),
    });
  }

  getCommandInfo(projectRoot, sessionId) {
    const root = projectRoot || this.projectRoot;
    return this._readJson(path.join(root, '.aet', 'state', `cmd-info-${sessionId}.json`));
  }

  clearCommandInfo(projectRoot, sessionId) {
    const root = projectRoot || this.projectRoot;
    const filePath = path.join(root, '.aet', 'state', `cmd-info-${sessionId}.json`);
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (e) {
      // 静默处理
    }
  }

  // 保存当前 xiaoO session_id，供 tools 读取（hooks 有 payload.session_id，tools 无）
  setCurrentSessionID(projectRoot, sessionID) {
    const stateDir = path.join(projectRoot, '.aet', 'state');
    if (!fs.existsSync(stateDir)) {
      fs.mkdirSync(stateDir, { recursive: true });
    }
    this._writeJson(path.join(stateDir, 'current-session.json'), {
      sessionID,
      updatedAt: new Date().toISOString(),
    });
  }

  getCurrentSessionID(projectRoot) {
    const root = projectRoot || this.projectRoot;
    const data = this._readJson(path.join(root, '.aet', 'state', 'current-session.json'));
    return data?.sessionID || null;
  }
}

module.exports = { StateStore };
