const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const source = `package main
import("encoding/json";"os";"os/exec";"github.com/KogenAI/kogen-loop/tools")
type repo struct{root string; Calls int}
func(r *repo) Run(a ...string)(tools.GitResult,error){r.Calls++;c:=exec.Command("git",a...);c.Dir=r.root;b,e:=c.Output();s:=0;se:="";if x,ok:=e.(*exec.ExitError);ok{s=x.ExitCode();se=string(x.Stderr);e=nil};return tools.GitResult{Stdout:string(b),Stderr:se,Status:s},e}
func(r *repo) Head()string{r.Calls++;return ""}
func(r *repo) Tree(string,[]string)(string,error){r.Calls++;return "",nil}
func main(){r:=&repo{root:os.Args[1]};t:=&tools.Tools{Root:r.root,Repo:r,Enabled:[]string{tools.ListFilesTool,tools.SearchTextTool}};var cs []tools.Call;if e:=json.NewDecoder(os.Stdin).Decode(&cs);e!=nil{panic(e)};for _,c:=range cs{r.Calls=0;o,e:=t.Call(c);if e!=nil{panic(e)};if e=json.NewEncoder(os.Stdout).Encode(map[string]any{"text":o.Text,"commands":r.Calls});e!=nil{panic(e)}}}
`;
function run(cmd,args,input) {
 const r=spawnSync(cmd,args,{input,encoding:'utf8',timeout:180000});
 assert.equal(r.status,0,cmd+' '+args.join(' ')+': '+r.stdout+r.stderr);
 return r.stdout;
}
function verify(rows, expected) {
 assert.equal(rows.length,expected.length);
 rows.forEach((r,i)=>{
  const e=expected[i];
  if(e.error){assert.match(r.text,/^error:/);assert.match(r.text,new RegExp(e.error,'i'));assert.equal(r.commands,0);assert.ok(!r.text.includes('two.txt'));}
  else {assert.equal(r.text,e.text);assert.ok(r.commands>0);}
 });
}
if(require.main===module){
 const rows=[{text:'error: argument path must be a string',commands:0},{text:'left/one.txt',commands:1}];
 if(process.argv[2]==='bad')rows[1].text='right/two.txt';
 try{verify(rows,[{error:'path'},{text:'left/one.txt'}]);console.log('accepted');}catch(e){console.log('rejected');process.exitCode=1;}
} else {
 const {When,Then}=require('@cucumber/cucumber');
 When('l-invalid-discovery-scope: I call {string} with raw arguments {string}',function(tool,raw){
  this.scopeRequests=[{Name:tool,Arguments:raw},{Name:tool,Arguments:JSON.stringify(tool==='search_text'?{pattern:'needle',path:'left'}:{path:'left'})}];
  this.scopeTool=tool;
 });
 Then('l-invalid-discovery-scope: the first result is {string} and correction returns {string}',function(kind,text){
  const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'invalid-scope-'));
  try {
   const root=path.join(tmp,'repo');fs.mkdirSync(root);run('git',['init','-q',root]);
   for(const [dir,file] of [['left','one.txt'],['right','two.txt']]){fs.mkdirSync(path.join(root,dir));fs.writeFileSync(path.join(root,dir,file),'needle\n');}
   const formatted=run('gofmt',[],source);const file=path.join(tmp,'main.go');fs.writeFileSync(file,formatted);
   assert.equal(run('gofmt',['-l',file]),'');
   const bin=path.join(tmp,'driver');run('go',['build','-o',bin,file]);
   const rows=run(bin,[root],JSON.stringify(this.scopeRequests)).trim().split('\n').map(JSON.parse);
   verify(rows,[kind==='path'||kind==='arguments'?{error:kind}:{text:text.replaceAll(';','\n')},{text:this.scopeTool==='search_text'?'left/one.txt:1:needle':'left/one.txt'}]);
  }finally{fs.rmSync(tmp,{recursive:true,force:true});}
 });
}
