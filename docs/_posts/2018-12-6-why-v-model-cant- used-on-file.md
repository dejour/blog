---
date: 2018-12-06
tags:
  - JavaScript
  - vue
author: Clay
location: shanghai
---

# why v-model can't used on file

我们在type为file的input上能用v-model吗?答案是否定的.如果我们这样使用,vue会给出包含```Use a v-on:change listener instead```的一段警告.列如这样一段template```<input v-model="file" type="file">```会转化成下面的ast(部分)

```json
{
  "type": 1,
  "tag": "input",
  "attrsList": [
    {
      "name": "v-model",
      "value": "file"
    },
    {
      "name": "type",
      "value": "file"
    }
  ],
  "attrsMap": {
    "v-model": "file",
    "type": "file"
  },
  "directives": [
    {
      "name": "model",
      "rawName": "v-model",
      "value": "file",
      "arg": null
    }
  ],
  "attrs": [
    {
      "name": "type",
      "value": "\"file\""
    }
  ],
}
```

然后在codegen过程处理v-model 指令,也就是在web/compiler/directives/model 路径下model函数里会执行以下代码.

```javascript
export default function model (
  el: ASTElement,
  dir: ASTDirective,
  _warn: Function
): ?boolean {

  if (process.env.NODE_ENV !== 'production') {
    // inputs with type="file" are read only and setting the input's
    // value will throw an error.
    if (tag === 'input' && type === 'file') {
      warn(
        `<${el.tag} v-model="${value}" type="file">:\n` +
        `File inputs are read only. Use a v-on:change listener instead.`
      )
    }
  }
}
```