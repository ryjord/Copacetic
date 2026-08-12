const { app } = require('electron');
app.whenReady().then(() => {
  console.log('  app.getVersion()        :', app.getVersion());
  console.log('  package.json version    :', require('./package.json').version);
  console.log('  process.versions.electron:', process.versions.electron);
  app.exit(0);
});
