/**
 * 命令模块入口
 */

const CreateIssueCommand = require('./create-issue');
const UpdateIssueCommand = require('./update-issue');
const ClaimIssueCommand = require('./claim-issue');
const ListIssuesCommand = require('./list-issues');
const GetIssueCommand = require('./get-issue');

module.exports = {
  CreateIssueCommand,
  UpdateIssueCommand,
  ClaimIssueCommand,
  ListIssuesCommand,
  GetIssueCommand
};