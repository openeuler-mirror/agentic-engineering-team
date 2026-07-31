'use strict';

const assert = require('assert');
const PullRequestAPI = require('../src/api/endpoints/pull-requests');
const CreatePrCommand = require('../src/cli/commands/create-pr');
const { ConfigManager } = require('../src/config');
const { PlatformAPIClient } = require('../src/api/client');

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }
function fakeClient(config) {
  return {
    config,
    async post(endpoint, data) {
      this.lastPost = { endpoint, data };
      return { number: 1, title: data.title };
    }
  };
}

test('GitCode API uses owner/repository:branch for a differently named fork', async () => {
  const client = fakeClient({
    platform: 'gitcode', owner: 'openeuler', repository: 'agentic-engineering-team',
    forkOwner: 'alice', forkRepository: 'agentic-engineering-team_openeuler'
  });
  await new PullRequestAPI(client).create({ title: 'test', head: 'fix/issue-6', base: 'master' });
  assert.strictEqual(client.lastPost.data.head,
    'alice/agentic-engineering-team_openeuler:fix/issue-6');
});

test('GitCode API keeps owner:branch for a same-name fork', async () => {
  const client = fakeClient({
    platform: 'gitcode', owner: 'upstream', repository: 'repo',
    forkOwner: 'alice', forkRepository: 'repo'
  });
  await new PullRequestAPI(client).create({ title: 'test', head: 'topic', base: 'master' });
  assert.strictEqual(client.lastPost.data.head, 'alice:topic');
});

test('GitHub keeps owner:branch when the fork repository was renamed', async () => {
  const client = fakeClient({
    platform: 'github', owner: 'upstream', repository: 'repo',
    forkOwner: 'alice', forkRepository: 'renamed-repo'
  });
  await new PullRequestAPI(client).create({ title: 'test', head: 'topic', base: 'master' });
  assert.strictEqual(client.lastPost.data.head, 'alice:topic');
});

test('GitCode handles a differently named source repository under the same owner', async () => {
  const client = fakeClient({
    platform: 'gitcode', owner: 'team', repository: 'repo',
    forkOwner: 'team', forkRepository: 'renamed-repo'
  });
  await new PullRequestAPI(client).create({ title: 'test', head: 'topic', base: 'master' });
  assert.strictEqual(client.lastPost.data.head, 'team/renamed-repo:topic');
});

test('API preserves an already qualified head', async () => {
  const client = fakeClient({
    platform: 'gitcode', owner: 'upstream', repository: 'repo',
    forkOwner: 'alice', forkRepository: 'renamed-repo'
  });
  await new PullRequestAPI(client).create({
    title: 'test', head: 'alice/renamed-repo:topic', base: 'master'
  });
  assert.strictEqual(client.lastPost.data.head, 'alice/renamed-repo:topic');
});

test('CLI leaves head normalization to the API layer', async () => {
  const command = new CreatePrCommand({ quiet: true });
  let received;
  command.init = async () => {
    command.configManager = { get: () => { throw new Error('CLI must not qualify head'); } };
    command.api = { pullRequests: { create: async data => {
      received = data;
      return { number: 1, title: data.title };
    } } };
    command.initialized = true;
  };
  command.success = () => {};
  command.error = () => {};
  await command.execute({
    sourceBranch: 'fix/issue-6', targetBranch: 'master',
    title: 'test', description: 'test'
  });
  assert.strictEqual(received.head, 'fix/issue-6');
});

test('project config exposes the fork repository as forkRepo', () => {
  const manager = new ConfigManager({ useNewPathResolver: false });
  const flat = manager._extractProjectConfig({
    codePlatform: {
      platform: { type: 'gitcode' },
      upstream: { owner: 'openeuler', repository: 'agentic-engineering-team' },
      fork: { owner: 'alice', repository: 'renamed-repo' }
    }
  });
  assert.strictEqual(flat.forkOwner, 'alice');
  assert.strictEqual(flat.forkRepo, 'renamed-repo');
});

test('GitCode client uses Bearer authentication', () => {
  const client = new PlatformAPIClient({
    platform: 'gitcode', token: 'not-a-secret', owner: 'o', repository: 'r'
  });
  assert.strictEqual(client.client.defaults.headers.Authorization, 'Bearer not-a-secret');
});

(async () => {
  let failed = 0;
  for (const { name, fn } of tests) {
    try {
      await fn();
      console.log(`ok - ${name}`);
    } catch (error) {
      failed += 1;
      console.error(`not ok - ${name}`);
      console.error(error && error.stack ? error.stack : error);
    }
  }
  console.log(`\n${tests.length - failed}/${tests.length} tests passed`);
  if (failed) process.exitCode = 1;
})();
