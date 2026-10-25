import assert from 'node:assert/strict';

export async function checkProtectionAndTerms(translate) {
  const protectionCases=[
    ['Hello, {{name}}!',['{{name}}']],
    ['Run ⏎',['⏎']],
    ['Copilot and Playwright use Context7 with the MCP Registry.',['Copilot','Playwright','Context7','MCP Registry']],
    ['Replace %s with the file name.',['%s']],
    ['Open {filename} and click Continue.',['{filename}']],
    ['Save the file to /opt/project/src/main.rs.',['/opt/project/src/main.rs']],
    ['Press Ctrl+Shift+P to open the command palette.',['Ctrl+Shift+P','命令面板']],
    ['Set the HOME environment variable to $HOME.',['HOME','$HOME','环境变量']],
    ['Use %(username)s as a placeholder.',['%(username)s']],
    ['Run npm install before starting.',['npm install']],
    ['Hello, {{ customer.name }}!',['{{ customer.name }}']],
    ['Read ${CONFIG_DIR} and $env:LOCALAPPDATA before starting.',['${CONFIG_DIR}','$env:LOCALAPPDATA']],
    ['Expand %USERPROFILE% and $(pwd) in this example.',['%USERPROFILE%','$(pwd)']],
    ['Format %(account_id)s and %(ratio)08.2f carefully.',['%(account_id)s','%(ratio)08.2f']],
    ['Preserve %1$s, %08.2f and {total:.2f} in this message.',['%1$s','%08.2f','{total:.2f}']],
    ['Run pnpm install --frozen-lockfile before restarting.',['pnpm install --frozen-lockfile']],
    ['Run python -m pip install numpy after opening the terminal.',['python -m pip install numpy']],
    ['Run git checkout -b feature/ui to create a branch.',['git checkout -b feature/ui']],
    ['Save the output in ../src/new-file.ts and ~/project/config.toml.',['../src/new-file.ts','~/project/config.toml']],
    ['Read C:\\Projects\\demo\\index.ts before making changes.',['C:\\Projects\\demo\\index.ts']],
    ['Use $HOME and $HOME consistently.',['$HOME','$HOME']],
    ['Please click 继续 to proceed.',['继续']],
    ['Keep `npm install` and {{配置名}} unchanged.',['`npm install`','{{配置名}}']],
    ['Preserve the value ZXQ0QXZ and $CONFIG_PATH.',['ZXQ0QXZ','$CONFIG_PATH']],
  ];
  const protectedTranslations=await translate(protectionCases.map(item=>item[0]));
  const failures=[];
  const protectionResults=protectionCases.map(([source,expected],index)=>{
    const translation=protectedTranslations[index];
    const counts=new Map();for(const token of expected)counts.set(token,(counts.get(token)||0)+1);
    const missing=[...counts].filter(([token,count])=>translation.split(token).length-1<count).map(([token])=>token);
    const result={source,translation,protected:missing.length===0,missing};
    if(missing.length)failures.push(result);
    return result;
  });
  const terminologyCases=[
    ['Command Palette',['命令面板']],
    ['The COMMAND PALETTE is available in this workspace.',['命令面板','工作区']],
    ['Open the command palettes in both workspaces.',['命令面板','工作区']],
    ['Simplified Chinese language pack',['简体中文语言包']],
    ['Install the Simplified Chinese language packs before restarting.',['简体中文语言包']],
    ['The display language controls the user interface.',['显示语言','用户界面']],
    ['Use the context menu to open conversation history.',['右键菜单','对话历史']],
    ['A shared conversation title appears in chat history.',['对话标题','对话历史']],
    ['The API keys are stored in environment variables.',['API 密钥','环境变量']],
  ];
  const termTranslations=await translate(terminologyCases.map(item=>item[0]));
  const terminologyResults=terminologyCases.map(([source,expected],index)=>{
    const translation=termTranslations[index];
    const result={source,translation,consistent:expected.every(term=>translation.includes(term))};
    if(!result.consistent)failures.push(result);
    return result;
  });
  assert.equal(protectedTranslations.length,protectionCases.length);
  assert.equal(termTranslations.length,terminologyCases.length);
  const existingChinese=['现有中文 Copilot 与 Playwright，查阅 MCP Registry。','官方 Registry 不托管代码，代码仍在 npm、PyPI、Docker Hub。','Please click 继续 to proceed.'];
  const preserved=await translate(existingChinese);
  const preservationResults=existingChinese.map((source,index)=>({source,translation:preserved[index],unchanged:preserved[index]===source}));
  for(const result of preservationResults)if(!result.unchanged)failures.push(result);
  return {protectionResults,terminologyResults,preservationResults,failures};
}
