import fs from 'node:fs';

// Public artifacts never depend on extracted installation metadata, including
// marker repair. Opt into local diagnostics explicitly; never infer the profile.
export function buildProfile(flags) {
  const profile=flags.profile ?? 'public';
  if (!['public','local'].includes(profile)) throw Error('构建配置必须为 --profile=public 或 --profile=local');
  return profile;
}

export function readBuildMetadata(profile,file) {
  if (profile === 'public') return null;
  if (!fs.existsSync(file)) throw Error('本机诊断构建需要先运行 npm run extract；公共发行请使用 --profile=public。');
  return JSON.parse(fs.readFileSync(file,'utf8'));
}
