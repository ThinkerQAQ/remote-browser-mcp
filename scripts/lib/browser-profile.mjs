import path from 'node:path';
import os from 'node:os';
export function browserProfile({platform = process.platform, browser = 'edge', userDataDir, env = process.env, home = os.homedir()} = {}) {
  if (!['edge', 'chrome'].includes(browser)) throw Error('Supported browsers: edge, chrome');
  if (userDataDir) return userDataDir;
  if (platform === 'win32') return path.win32.join(env.LOCALAPPDATA || path.win32.join(home, 'AppData', 'Local'), browser === 'edge' ? 'Microsoft/Edge/User Data' : 'Google/Chrome/User Data');
  if (platform === 'darwin') return path.posix.join(home, 'Library', 'Application Support', browser === 'edge' ? 'Microsoft Edge' : 'Google/Chrome');
  if (platform === 'linux') return path.posix.join(env.XDG_CONFIG_HOME || path.posix.join(home, '.config'), browser === 'edge' ? 'microsoft-edge' : 'google-chrome');
  throw Error('Unsupported operating system');
}
export function browserPortPath(options = {}) {
  const profile = browserProfile(options);
  return (options.platform === 'win32' || (!options.platform && process.platform === 'win32')) ? path.win32.join(profile, 'DevToolsActivePort') : path.posix.join(profile, 'DevToolsActivePort');
}
