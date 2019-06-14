---
date: 2018-12-09
tags:
  - JavaScript
  - vue
  - v-model
author: Clay
location: shanghai
---

# how v-model on select work

v-model 也能用于select, 如

```html
<select v-model="test"> 
  <option>a</option>
  <option>b</option>
  <option>c</option>
</select>
```

如果test为'a', 则第一个option会被选中.以此类推.

上面的ast 会解析为下面的ast:

```json
{
  "type": 1,
  "tag": "select",
  "attrsList": [
    {
      "name": "v-model",
      "value": "test"
    }
  ],
  "attrsMap": {
    "v-model": "test"
  },
  "children": [
    {
      "type": 1,
      "tag": "option",
      "attrsList": [],
      "attrsMap": {},
      "parent": "[Circular ~]",
      "children": [
        {
          "type": 3,
          "text": "a",
          "static": true
        }
      ],
      "plain": true,
      "static": true,
      "staticInFor": false,
      "staticRoot": false
    },
    {
      "type": 1,
      "tag": "option",
      "attrsList": [],
      "attrsMap": {},
      "parent": "[Circular ~]",
      "children": [
        {
          "type": 3,
          "text": "b",
          "static": true
        }
      ],
      "plain": true,
      "static": true,
      "staticInFor": false,
      "staticRoot": false
    },
    {
      "type": 1,
      "tag": "option",
      "attrsList": [],
      "attrsMap": {},
      "parent": "[Circular ~]",
      "children": [
        {
          "type": 3,
          "text": "c",
          "static": true
        }
      ],
      "plain": true,
      "static": true,
      "staticInFor": false,
      "staticRoot": false
    }
  ],
  "plain": false,
  "hasBindings": true,
  "directives": [
    {
      "name": "model",
      "rawName": "v-model",
      "value": "test",
      "arg": null
    }
  ],
  "static": false,
  "staticRoot": false
}
```

然后经过codegen生成下面的render函数:

```javascript
(function anonymous() {
    with (this) {
        return _c('select', {
            directives: [{
                name: "model",
                rawName: "v-model",
                value: (test),
                expression: "test"
            }],
            on: {
                "change": function($event) {
                    var $$selectedVal = Array.prototype.filter.call($event.target.options, function(o) {
                        return o.selected
                    }).map(function(o) {
                        var val = "_value"in o ? o._value : o.value;
                        return val
                    });
                    test = $event.target.multiple ? $$selectedVal : $$selectedVal[0]
                }
            }
        }, [_c('option', [_v("a")]), _c('option', [_v("b")]), _c('option', [_v("c")])])
    }
}
)
```

从上面的函数可以看到缺少domProps,那么它是怎么将test的值转化成ui的呢, 我们可以猜测在v-model指令对应的runtime定义中,确实我们我们可以在```runtime/directives/model.js```中找到actuallySetSelected函数

```javascript
function actuallySetSelected (el, binding, vm) {
  const value = binding.value
  const isMultiple = el.multiple
  if (isMultiple && !Array.isArray(value)) {
    process.env.NODE_ENV !== 'production' && warn(
      `<select multiple v-model="${binding.expression}"> ` +
      `expects an Array value for its binding, but got ${
        Object.prototype.toString.call(value).slice(8, -1)
      }`,
      vm
    )
    return
  }
  let selected, option
  for (let i = 0, l = el.options.length; i < l; i++) {
    option = el.options[i]
    if (isMultiple) {
      selected = looseIndexOf(value, getValue(option)) > -1
      if (option.selected !== selected) {
        option.selected = selected
      }
    } else {
      if (looseEqual(getValue(option), value)) {
        if (el.selectedIndex !== i) {
          el.selectedIndex = i
        }
        return
      }
    }
  }
  if (!isMultiple) {
    el.selectedIndex = -1
  }
}
```

它所做的事,就是select为multiple, 遍历options, 如果在binding.value找到对应的索引,将option.selected 设为true, 若select不为multiple, 将el.selectedIndex设为找到的第一个option与binding.value相同的索引.v-model runtime 还定义了componentUpdated hook, 基本上也是设置已经选中的option, 当下面还有一段代码:

```javascript
// in case the options rendered by v-for have changed,
      // it's possible that the value is out-of-sync with the rendered options.
      // detect such cases and filter out values that no longer has a matching
      // option in the DOM.
      // const prevOptions = el._vOptions
      const curOptions = el._vOptions = [].map.call(el.options, getValue)
      if (curOptions.some((o, i) => !looseEqual(o, prevOptions[i]))) {
        // trigger change event if
        // no matching option found for at least one value
        const needReset = el.multiple
          ? binding.value.some(v => hasNoMatchingOption(v, curOptions))
          : binding.value !== binding.oldValue && hasNoMatchingOption(binding.value, curOptions)
        if (needReset) {
          trigger(el, 'change')
        }
}
```

这段代码是做什么的呢?如果你第一眼看不出来,可以使用我这个小技巧.那就是注释掉这段代码,然后运行unit test.然后看它break那个用例.按照这种方法我们这段代码对应的用法

```javascript
const vm = new Vue({
        data: {
          test: ['b'],
          opts: ['a', 'b', 'c']
        },
        template:
          '<select v-model="test" multiple>' +
            '<option v-for="o in opts">{{ o }}</option>' +
          '</select>'
      }).$mount()
      const opts = vm.$el.options
      expect(opts[0].selected).toBe(false)
      expect(opts[1].selected).toBe(true)
      expect(opts[2].selected).toBe(false)
      vm.test = ['a', 'c']
      waitForUpdate(() => {
        expect(opts[0].selected).toBe(true)
        expect(opts[1].selected).toBe(false)
        expect(opts[2].selected).toBe(true)
        opts[0].selected = false
        opts[1].selected = true
        triggerEvent(vm.$el, 'change')
        expect(vm.test).toEqual(['b', 'c'])
        // update v-for opts
        vm.opts = ['c', 'd']
      }).then(() => {
        expect(opts[0].selected).toBe(true)
        expect(opts[1].selected).toBe(false) // 
        expect(vm.test).toEqual(['c']) // should remove 'd' which no longer has a matching option
}).then(done)
```

```expect(vm.test).toEqual(['c'])```这个断言不通过.为什么呢?在未修改v-for opts, vm.test的值为['b', 'c'],修改后的opts为['c', 'd'],我们会根据vm.test去设置新的ui,但是vm.test中的 'b' 在opts 中也不存在了, 因此我们同样需要更新test,将不存在对应option的value去掉.这正是上面componentUpdated hook中的那部分代码所做的事,如果需要reset, 触发select 的change事件,由change的handler将vm.test赋值为实际已选的option.