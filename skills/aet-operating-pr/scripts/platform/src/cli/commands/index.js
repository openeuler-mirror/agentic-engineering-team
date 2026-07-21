/**
 * 命令模块入口
 */

const CreatePrCommand = require('./create-pr');
const UpdatePrCommand = require('./update-pr');
const ListPrsCommand = require('./list-prs');
const GetPrCommand = require('./get-pr');
const GetPrFilesCommand = require('./get-pr-files');
const GetPrCommentsCommand = require('./get-pr-comments');
const AddCommentCommand = require('./add-comment');
const DeleteCommentCommand = require('./delete-comment');

module.exports = {
  CreatePrCommand,
  UpdatePrCommand,
  ListPrsCommand,
  GetPrCommand,
  GetPrFilesCommand,
  GetPrCommentsCommand,
  AddCommentCommand,
  DeleteCommentCommand
};