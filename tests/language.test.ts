import test from 'node:test';
import assert from 'node:assert/strict';
import {detectLanguage,normalizeLanguage,readLanguageChoice,saveLanguageChoice,LANGUAGE_STORAGE_KEY} from '../lib/language';

test('normalizes supported language codes and regional variants',()=>{
 for(const code of ['th','th-TH','TH_th'])assert.equal(normalizeLanguage(code),'th');
 for(const code of ['zh','zh-CN','zh-TW','zh-HK','zh-Hans-CN'])assert.equal(normalizeLanguage(code),'zh-CN');
 for(const code of ['en','en-US','en-GB'])assert.equal(normalizeLanguage(code),'en');
 for(const value of ['ja','zhen','',null,12,{}])assert.equal(normalizeLanguage(value),null);
});

test('explicit choice takes precedence over provider and browser languages',()=>{
 assert.deepEqual(detectLanguage({choice:'en',line:'zh-TW',wechat:'zh-CN',browserLanguages:['th']}),{locale:'en',source:'choice'});
 assert.deepEqual(detectLanguage({choice:'invalid',line:'zh-HK',wechat:'en',browserLanguages:['th']}),{locale:'zh-CN',source:'line'});
 assert.deepEqual(detectLanguage({line:'invalid',wechat:'en-US',browserLanguages:['th']}),{locale:'en',source:'wechat'});
});

test('browser list is searched before browser language; absent values fall back to Thai',()=>{
 assert.deepEqual(detectLanguage({browserLanguages:['ja-JP','en-GB'],browserLanguage:'zh-CN'}),{locale:'en',source:'browser'});
 assert.deepEqual(detectLanguage({browserLanguages:['ja'],browserLanguage:'zh-HK'}),{locale:'zh-CN',source:'browser'});
 assert.deepEqual(detectLanguage({}),{locale:'th',source:'default'});
});

test('saved choices are validated and storage errors do not block detection',()=>{
 const values=new Map<string,string>();
 const storage={getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>{values.set(key,value)}};
 assert.equal(readLanguageChoice(storage),null);
 assert.equal(saveLanguageChoice(storage,'zh-TW'),'zh-CN');
 assert.equal(values.get(LANGUAGE_STORAGE_KEY),'zh-CN');
 assert.equal(readLanguageChoice(storage),'zh-CN');
 values.set(LANGUAGE_STORAGE_KEY,'malformed');
 assert.equal(readLanguageChoice(storage),null);
 assert.throws(()=>saveLanguageChoice(storage,'ja'),/unsupported_language/);
 assert.equal(readLanguageChoice({getItem:()=>{throw Error('denied')}}),null);
 assert.throws(()=>saveLanguageChoice({setItem:()=>{throw Error('denied')}},'en'),/denied/);
});
