---
date: 2018-12-08
tags:
  - JavaScript
  - vue
author: Clay
location: shanghai
---

# how v-model on radio work

v-model 能用于radio input,例如:

```html
 <div>
      <input type="radio" value="1" v-model="test" name="test">
      <input type="radio" value="2" v-model="test" name="test">
 </div>
```

当test为'1'时, 第一个input为checked状态,当你点击第二个input时,它的状态为checked,且test被设为"2".

这段template会解析为下面的ast(部分):

```json
{
  "type": 1,
  "tag": "div",
  "attrsList": [],
  "attrsMap": {},
  "children": [
    {
      "type": 1,
      "tag": "input",
      "attrsList": [
        {
          "name": "type",
          "value": "radio"
        },
        {
          "name": "value",
          "value": "1"
        },
        {
          "name": "v-model",
          "value": "test"
        },
        {
          "name": "name",
          "value": "test"
        }
      ],
      "attrsMap": {
        "type": "radio",
        "value": "1",
        "v-model": "test",
        "name": "test"
      },
      "attrs": [
        {
          "name": "type",
          "value": "\"radio\""
        },
        {
          "name": "value",
          "value": "\"1\""
        },
        {
          "name": "name",
          "value": "\"test\""
        }
      ],
    
      "directives": [
        {
          "name": "model",
          "rawName": "v-model",
          "value": "test",
          "arg": null
        }
      ],
   
    },
    {
      "type": 1,
      "tag": "input",
      "attrsList": [
        {
          "name": "type",
          "value": "radio"
        },
        {
          "name": "value",
          "value": "2"
        },
        {
          "name": "v-model",
          "value": "test"
        },
        {
          "name": "name",
          "value": "test"
        }
      ],
      "attrsMap": {
        "type": "radio",
        "value": "2",
        "v-model": "test",
        "name": "test"
      },
      "attrs": [
        {
          "name": "type",
          "value": "\"radio\""
        },
        {
          "name": "value",
          "value": "\"2\""
        },
        {
          "name": "name",
          "value": "\"test\""
        }
      ],
      "directives": [
        {
          "name": "model",
          "rawName": "v-model",
          "value": "test",
          "arg": null
        }
      ],
    }
  ],

}
```

ast 经过codegen 会生成下面的render 函数

```javascript
(function anonymous() {
    with (this) {
        return _c('div', [_c('input', {
            directives: [{
                name: "model",
                rawName: "v-model",
                value: (test),
                expression: "test"
            }],
            attrs: {
                "type": "radio",
                "value": "1",
                "name": "test"
            },
            domProps: {
                "checked": _q(test, "1")
            },
            on: {
                "change": function($event) {
                    test = "1"
                }
            }
        }), _v(" "), _c('input', {
            directives: [{
                name: "model",
                rawName: "v-model",
                value: (test),
                expression: "test"
            }],
            attrs: {
                "type": "radio",
                "value": "2",
                "name": "test"
            },
            domProps: {
                "checked": _q(test, "2")
            },
            on: {
                "change": function($event) {
                    test = "2"
                }
            }
        })])
    }
}
)
```

从domProps可以看出v-model的绑定值会和radio的value属性比较(looseEqual)来决定checked 属性.同时radio的change事件触发会将对应的value属性值赋值给v-model的绑定变量