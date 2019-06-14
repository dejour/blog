---
date: 2018-12-17
tags:
  - JavaScript
  - vue
  - v-model
author: Clay
location: shanghai
---
# how v-model on component work
v-model可以用在用户自定义的组件和不同类型的input或textarea上,本节主要讲解v-model用于自定义组件的实现方式.
首先,我们可以从vue的test文件中找到它的一些用法.

自定义:
```
<test v-model="msg"></test>
test定义
{
  props: ['value'],
  template: `<input :value="value" @input="$emit('input', $event.target.value)">`
}
```
is component:
```
<input is="test" v-model="msg">
test定义
{
  props: ['value'],
  template: `<input :value="value" @input="$emit('input', $event.target.value)">`
}
```
自定义v-model的props和event:
```
<test v-model="msg" @update="spy"></test>
{
  model: {
    prop: 'currentValue',
    event: 'update'
  },
  props: ['currentValue'],
  template: `<input :value="currentValue" @input="$emit('update', $event.target.value)">`
}
```
modifiers:
```
<my-input ref="input" v-model.number="text"></my-input>
<my-input ref="input" v-model.trim="text"></my-input>
```
从第一个和第二个用例可以看出使用v-model的组件必须定义value prop和input事件. 在第三个用例中也可以看出可以自定义v-model所需要的prop和event.还可以加上number modifier将输入转化为number, 加上trim modifier去掉前后空格. 

接下来我们来看看他们是怎么实现的,不带modifier的template转换成的代码如下
```
(function anonymous(
) {
with(this){return _c('test',{
  model:{
    value:(msg),
    callback:function ($$v) {msg=$$v},
    expression:"msg"
  }
})}
})
```
那么这个代码是怎么生成的呢.template变成code经历了两个过程,parse 和 code generation.
parse 先生成ast, ast然后用于code generation, ast中间根据需要可以变化.
```<test v-model="msg"></test>```见过parse后生成的ast为
```
{
    "type": 1,
    "tag": "test",
    "attrsList": [{ "name": "v-model", "value": "msg" }],
    "attrsMap": { "v-model": "msg" },
    "children": [],
    "plain": false,
    "hasBindings": true,
    "directives": [{ "name": "model", "rawName": "v-model", "value": "msg", "arg": null }]
}
```
用此ast生成code的函数名为generate, 你可以在vue源码中全局搜索这个名字,生成上述代码的部分为
```
var data = el.plain ? undefined : genData(el, state);

var children = el.inlineTemplate ? null : genChildren(el, state, true);
code = "_c('" + (el.tag) + "'" + (data ? ("," + data) : '') + (children ? ("," + children) : '') + ")";
```
可以看出,这段代码先生成了data代码和genChildren,在拼接生成当前元素.因为ast中children为空数组,我们可以暂时忽略,先重点关注genData.genData然后调用genDirectives.genDirectives就是用预先定义的处理directive函数处理ast里的directives,包括bind, clock, html, model, on, text. 对于我们的ast里的model directive, 当然用的是model 函数
```
function model (
  el,
  dir,
  _warn
) {

  if (!config.isReservedTag(tag)) {
    genComponentModel(el, value, modifiers);
    // component v-model doesn't need extra runtime
    return false
  } else {
  }

  // ensure runtime directive metadata
  return true
}
```
这里省略现在用不到的部分.然后在看genComponentModel,此函数属于core里,不在platform,因为与平台无关.
```
function genComponentModel (
  el,
  value,
  modifiers
) {
  var ref = modifiers || {};
  var number = ref.number;
  var trim = ref.trim;

  var baseValueExpression = '$$v';
  var valueExpression = baseValueExpression;
  if (trim) {
    valueExpression =
      "(typeof " + baseValueExpression + " === 'string'" +
      "? " + baseValueExpression + ".trim()" +
      ": " + baseValueExpression + ")";
  }
  if (number) {
    valueExpression = "_n(" + valueExpression + ")";
  }
  var assignment = genAssignmentCode(value, valueExpression);

  el.model = {
    value: ("(" + value + ")"),
    expression: ("\"" + value + "\""),
    callback: ("function (" + baseValueExpression + ") {" + assignment + "}")
  };
}
```
这个函数将ast上directives属性里的model,