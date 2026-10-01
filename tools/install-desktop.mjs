// Puts a "Sammy Lightfoot" icon on the Windows desktop (run from WSL).
//
//   node tools/install-desktop.mjs      (or: npm run desktop)
//
// What it does:
//   1. builds the single-file game and the icon
//   2. copies both to  %LOCALAPPDATA%\SammyLightfoot\
//   3. creates  Desktop\Sammy Lightfoot.lnk  that opens the game in its own
//      Edge app window (no tabs, no address bar). If Edge is missing, the
//      shortcut opens the html in the default browser instead.
//
// Nothing is installed and no server runs: the shortcut opens a local file.
// To remove it, delete the shortcut and the SammyLightfoot folder.
// Re-run this after changing the game to refresh the installed copy.

import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { buildSingleFile } from './build-single.mjs';
import { buildIco } from './make-icon.mjs';

const APP_DIR = 'SammyLightfoot';
const SHORTCUT = 'Sammy Lightfoot.lnk';

function ps(command) {
  return execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], { encoding: 'utf8' }).replace(/\r/g, '').trim();
}
const toWsl = (winPath) => execFileSync('wslpath', ['-u', winPath], { encoding: 'utf8' }).trim();

let localAppData;
try {
  localAppData = ps("[Environment]::GetFolderPath('LocalApplicationData')");
} catch (e) {
  console.error('This installer needs Windows PowerShell (run it from WSL on the Windows machine).');
  console.error(String(e.message).split('\n')[0]);
  process.exit(1);
}

const winDir = `${localAppData}\\${APP_DIR}`;
const dir = toWsl(winDir);
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, 'sammy-lightfoot.html'), buildSingleFile());
writeFileSync(join(dir, 'sammy-lightfoot.ico'), buildIco());

// The shortcut is made by a script kept next to the game, so it can be re-run by hand.
const script = `$ErrorActionPreference = 'Stop'
$dir = Split-Path -Parent $MyInvocation.MyCommand.Path
$html = Join-Path $dir 'sammy-lightfoot.html'
$ico = Join-Path $dir 'sammy-lightfoot.ico'
$desktop = [Environment]::GetFolderPath('Desktop')
$lnk = Join-Path $desktop '${SHORTCUT}'
$edge = @("\${env:ProgramFiles(x86)}\\Microsoft\\Edge\\Application\\msedge.exe", "$env:ProgramFiles\\Microsoft\\Edge\\Application\\msedge.exe") | Where-Object { Test-Path $_ } | Select-Object -First 1
$s = (New-Object -ComObject WScript.Shell).CreateShortcut($lnk)
if ($edge) {
  $s.TargetPath = $edge
  $s.Arguments = '--app="' + ([Uri]$html).AbsoluteUri + '" --window-size=900,660'
} else {
  $s.TargetPath = $html
  $s.Arguments = ''
}
$s.WorkingDirectory = $dir
$s.IconLocation = "$ico,0"
$s.Description = 'Sammy Lightfoot (fan remake of the 1983 Sierra game)'
$s.Save()
Write-Output "shortcut=$lnk"
`;
writeFileSync(join(dir, 'make-shortcut.ps1'), script.replace(/\n/g, '\r\n'));
const made = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', `${winDir}\\make-shortcut.ps1`], { encoding: 'utf8' }).replace(/\r/g, '').trim();
const lnk = made.split('\n').find((l) => l.startsWith('shortcut=')).slice('shortcut='.length);

// Read the shortcut back and check everything it points at really exists.
const check = ps(`$s = (New-Object -ComObject WScript.Shell).CreateShortcut('${lnk.replace(/'/g, "''")}'); 'target=' + $s.TargetPath; 'args=' + $s.Arguments; 'icon=' + $s.IconLocation; 'targetExists=' + (Test-Path $s.TargetPath); 'iconExists=' + (Test-Path ($s.IconLocation -replace ',\\d+$',''))`);
const info = Object.fromEntries(check.split('\n').map((l) => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1)]; }));

console.log(`Game:     ${winDir}\\sammy-lightfoot.html`);
console.log(`Shortcut: ${lnk}`);
console.log(`Opens:    ${info.target} ${info.args}`);
console.log(`Icon:     ${info.icon}`);
const ok = existsSync(toWsl(lnk)) && info.targetExists === 'True' && info.iconExists === 'True';
if (!ok) {
  console.error('The shortcut was written but something it points at is missing:', info);
  process.exit(1);
}
console.log('OK: the shortcut, its target and its icon all exist.');
