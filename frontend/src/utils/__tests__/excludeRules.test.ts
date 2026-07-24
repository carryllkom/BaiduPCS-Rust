import { describe, it, expect } from 'vitest'
import { mergeRules, parseRuleInput } from '../excludeRules'

describe('excludeRules 输入解析（换行是唯一分隔符）', () => {
  it('多行文本：每行一条', () => {
    expect(parseRuleInput('*1080P*\n*.zip*\r\n*flv*')).toEqual(['*1080P*', '*.zip*', '*flv*'])
  })

  it('逗号/分号/顿号不作分隔 —— 它们是合法的文件名字符，可能属于规则本身', () => {
    expect(parseRuleInput('*第1，2集*')).toEqual(['*第1，2集*'])
    expect(parseRuleInput('*flv*,*.avi*')).toEqual(['*flv*,*.avi*'])
    expect(parseRuleInput('*上、下部*')).toEqual(['*上、下部*'])
  })

  it('单条文本：trim 后原样返回；空白输入返回空', () => {
    expect(parseRuleInput('  *Soft*  ')).toEqual(['*Soft*'])
    expect(parseRuleInput('')).toEqual([])
    expect(parseRuleInput('  \n  ')).toEqual([])
  })

  it('规则含空格不被切分（如目录名带空格）', () => {
    expect(parseRuleInput('*S02 连载中*')).toEqual(['*S02 连载中*'])
  })

  it('多行中的空行被忽略', () => {
    expect(parseRuleInput('*a*\n\n\n*b*\n  \n')).toEqual(['*a*', '*b*'])
  })

  it('mergeRules：去重、保序、trim，不修改入参', () => {
    const existing = ['*1080P*']
    const merged = mergeRules(existing, [' *1080P* ', '*.zip*', '', '*.zip*'])
    expect(merged).toEqual(['*1080P*', '*.zip*'])
    expect(existing).toEqual(['*1080P*'])
  })
})
