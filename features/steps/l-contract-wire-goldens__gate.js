const { Then } = require('@cucumber/cucumber');
const fs = require('fs');
const { execSync } = require('child_process');

Then('l-contract-wire-goldens: the fixture {string} is readable', function (file) {
  fs.readFileSync(file, 'utf8');
});

Then('l-contract-wire-goldens: the command {string} succeeds', { timeout: 60000 }, function (command) {
  execSync(command, { stdio: 'pipe' });
});
