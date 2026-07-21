/**
 * Commands module entry
 */

const CreateReleaseCommand = require('./create-release');
const ListReleasesCommand = require('./list-releases');
const GetReleaseCommand = require('./get-release');
const LatestReleaseCommand = require('./latest-release');
const UpdateReleaseCommand = require('./update-release');
const DeleteReleaseCommand = require('./delete-release');
const UploadUrlCommand = require('./upload-url');
const DownloadAssetCommand = require('./download-asset');

module.exports = {
  CreateReleaseCommand,
  ListReleasesCommand,
  GetReleaseCommand,
  LatestReleaseCommand,
  UpdateReleaseCommand,
  DeleteReleaseCommand,
  UploadUrlCommand,
  DownloadAssetCommand
};