---
date: 2018-12-09
tags:
  - JavaScript
  - vue
  - v-model
author: Clay
location: shanghai
---

# how v-model on dynamic input work

v-model 能和type为动态的input一起使用.

如template```<input :type="inputType" v-model="test">```

此template转化成如下ast(部分)

```json
{
    "type": 1,
    "tag": "input",
    "attrsList": [{ "name": "v-model", "value": "test" }, { "name": "type", "value": "checkbox" }],
    "attrsMap": { "v-model": "test", "type": "checkbox" },
    "directives": [{ "name": "model", "rawName": "v-model", "value": "test", "arg": null }],
    "attrs": [{ "name": "type", "value": "\"checkbox\"" }],
    "if": "(inputType)==='checkbox'",
    "ifConditions": [
        {
            "exp": "(inputType)==='checkbox'",
            "block": [circular]
        },
        {
            "exp": "(inputType)==='radio'",
            "block": {
                "type": 1,
                "tag": "input",
                "attrsList": [{ "name": "v-model", "value": "test" }, { "name": "type", "value": "radio" }],
                "attrsMap": { "v-model": "test", "type": "radio" },
                "children": [],
                "plain": false,
                "hasBindings": true,
                "directives": [{ "name": "model", "rawName": "v-model", "value": "test", "arg": null }],
                "attrs": [{ "name": "type", "value": "\"radio\"" }]
            }
        },
        {
            "block": {
                "type": 1,
                "tag": "input",
                "attrsList": [{ "name": "v-model", "value": "test" }, { "name": ":type", "value": "inputType" }],
                "attrsMap": { "v-model": "test", ":type": "inputType" },
                "children": [],
                "plain": false,
                "hasBindings": true,
                "directives": [{ "name": "model", "rawName": "v-model", "value": "test", "arg": null }],
                "attrs": [{ "name": "type", "value": "inputType" }]
            }
        }
    ]
}

```

为什么会生成了ifConditions,是因为这个文件```/src/platforms/web/compiler/modules/model.js```里的preTransformNode函数,上面的注释很好的描述了他的作用.

> Expand input[v-model] with dyanmic type bindings into v-if-else chains
>
> Turn this:
>
> <input v-model="data[type]" :type="type"\>
>
> into this:
>
> <input v-if="type === 'checkbox'" type="checkbox" v-model="data[type]"\>
>
> <input v-else-if="type === 'radio'" type="radio" v-model="data[type]"\>
>
> <input v-else :type="type" v-model="data[type]"\>

每个ast element 都会经过preTransformNode, 只有满足以下条件才会进行处理

```javascript
if (el.tag === 'input') {
    const map = el.attrsMap
    if (!map['v-model']) {
      return
    }

    let typeBinding
    if (map[':type'] || map['v-bind:type']) {
      typeBinding = getBindingAttr(el, 'type')
    }
    if (!map.type && !typeBinding && map['v-bind']) {
      typeBinding = `(${map['v-bind']}).type`
    }
    if (typeBinding) {
        ...
    }
}
```

element 的 tag为input, 上面有v-model指令,且动态绑定了type属性. 这个用例所执行的部分代码:

```javascript
// 1. checkbox
  const branch0 = cloneASTElement(el)
  addRawAttr(branch0, 'type', 'checkbox')
  processElement(branch0, options)
  branch0.processed = true // prevent it from double-processed
  branch0.if = `(${typeBinding})==='checkbox'` + ifConditionExtra // ifConditionExtra为''
  addIfCondition(branch0, {
    exp: branch0.if,
    block: branch0
  })
// 2. add radio else-if condition
const branch1 = cloneASTElement(el)
getAndRemoveAttr(branch1, 'v-for', true)
addRawAttr(branch1, 'type', 'radio')
processElement(branch1, options)
addIfCondition(branch0, {
    exp: `(${typeBinding})==='radio'` + ifConditionExtra,
    block: branch1
})
// 3. other
const branch2 = cloneASTElement(el)
getAndRemoveAttr(branch2, 'v-for', true)
addRawAttr(branch2, ':type', typeBinding)
processElement(branch2, options)
addIfCondition(branch0, {
    exp: ifCondition,
    block: branch2
})
```

这段代码主要做的是,将原始element转化成带有ifCondition的element. 第一个检查type为checkbox,第二个检查type为radio,第三个处理其他情况.为什么要这要做,从生成的render函数可以看出checkbox和radio需要特殊处理.

Ast 生成如下代码

```javascript
(function anonymous() {
    with (this) {
        return ((inputType) === 'checkbox') ? _c('input', {
            directives: [{
                name: "model",
                rawName: "v-model",
                value: (test),
                expression: "test"
            }],
            attrs: {
                "type": "checkbox"
            },
            domProps: {
                "checked": Array.isArray(test) ? _i(test, null) > -1 : (test)
            },
            on: {
                "change": function($event) {
                    var $$a = test
                      , $$el = $event.target
                      , $$c = $$el.checked ? (true) : (false);
                    if (Array.isArray($$a)) {
                        var $$v = null
                          , $$i = _i($$a, $$v);
                        if ($$el.checked) {
                            $$i < 0 && (test = $$a.concat([$$v]))
                        } else {
                            $$i > -1 && (test = $$a.slice(0, $$i).concat($$a.slice($$i + 1)))
                        }
                    } else {
                        test = $$c
                    }
                }
            }
        }) : ((inputType) === 'radio') ? _c('input', {
            directives: [{
                name: "model",
                rawName: "v-model",
                value: (test),
                expression: "test"
            }],
            attrs: {
                "type": "radio"
            },
            domProps: {
                "checked": _q(test, null)
            },
            on: {
                "change": function($event) {
                    test = null
                }
            }
        }) : _c('input', {
            directives: [{
                name: "model",
                rawName: "v-model",
                value: (test),
                expression: "test"
            }],
            attrs: {
                "type": inputType
            },
            domProps: {
                "value": (test)
            },
            on: {
                "input": function($event) {
                    if ($event.target.composing)
                        return;
                    test = $event.target.value
                }
            }
        })
    }
}
)
```