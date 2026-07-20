const { program } = require('./cli/commander');

async function main() {
  program.parse(process.argv);
}

module.exports = { main };