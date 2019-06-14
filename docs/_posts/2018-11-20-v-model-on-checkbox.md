---
date: 2018-11-20
tags:
  - JavaScript
  - vue
  - v-model
author: Clay
location: shanghai
---
# how v-model on checkbox work

从spec文件中可以看出最简单的在checkbox上使用v-model的方式为
```javascript
<input type="checkbox" v-model="test">
```
如果你将这个template编译成为render函数可以得到下面的内容
```javascript
(function anonymous() {
    with (this) {
        return _c('input', {
            directives: [{ name: 'model', rawName: 'v-model', value: test, expression: 'test' }],
            attrs: { type: 'checkbox' },
            domProps: { checked: Array.isArray(test) ? _i(test, null) > -1 : test },
            on: {
                change: function($event) {
                    var $$a = test,
                        $$el = $event.target,
                        $$c = $$el.checked ? true : false;
                    if (Array.isArray($$a)) {
                        var $$v = null,
                            $$i = _i($$a, $$v);
                        if ($$el.checked) {
                            $$i < 0 && (test = $$a.concat([$$v]));
                        } else {
                            $$i > -1 && (test = $$a.slice(0, $$i).concat($$a.slice($$i + 1)));
                        }
                    } else {
                        test = $$c;
                    }
                }
            }
        });
    }
});
```
首先看下这个简单的template是怎么变成上面的render函数的.首先tempalte经过parse后变成下面的ast
```javascript
{
    "type": 1,
    "tag": "input",
    "attrsList": [{ "name": "type", "value": "checkbox" }, { "name": "v-model", "value": "test" }],
    "attrsMap": { "type": "checkbox", "v-model": "test" },
    "children": [],
    "plain": false,
    "attrs": [{ "name": "type", "value": "\"checkbox\"" }],
    "hasBindings": true,
    "directives": [{ "name": "model", "rawName": "v-model", "value": "test", "arg": null }]
}
```
然后在codegen的过程中,我们在genData中调用genDirectives,

```javascript
needRuntime = true;
var gen = state.directives[dir.name]; // this case, state.directives[dir.name] is model function
if (gen) {
  // compile-time directive that manipulates AST.
  // returns true if it also needs a runtime counterpart.
  needRuntime = !!gen(el, dir, state.warn);
}
if (needRuntime) {
  hasRuntime = true;
  res += "{name:\"" + (dir.name) + "\",rawName:\"" + (dir.rawName) + "\"" + (dir.value ? (",value:(" + (dir.value) + "),expression:" + (JSON.stringify(dir.value))) : '') + (dir.arg ? (",arg:\"" + (dir.arg) + "\"") : '') + (dir.modifiers ? (",modifiers:" + (JSON.stringify(dir.modifiers))) : '') + "},";
}
```
为什么有个needRuntime, 后续会讲到. 对于每个directive都有对应的函数来处理.v-model 对应的就是model函数.

```javascript
function model (
  el,
  dir,
  _warn
) {
  warn$1 = _warn;
  var value = dir.value;
  var modifiers = dir.modifiers;
  var tag = el.tag;
  var type = el.attrsMap.type;

  if (tag === 'input' && type === 'checkbox') {
    genCheckboxModel(el, value, modifiers);
  }

  // ensure runtime directive metadata
  return true
}

function genCheckboxModel (
  el,
  value,
  modifiers
) {
  var number = modifiers && modifiers.number;
  var valueBinding = getBindingAttr(el, 'value') || 'null';
  var trueValueBinding = getBindingAttr(el, 'true-value') || 'true';
  var falseValueBinding = getBindingAttr(el, 'false-value') || 'false';
  addProp(el, 'checked',
    "Array.isArray(" + value + ")" +
    "?_i(" + value + "," + valueBinding + ")>-1" + (
      trueValueBinding === 'true'
        ? (":(" + value + ")")
        : (":_q(" + value + "," + trueValueBinding + ")")
    )
  );
  addHandler(el, 'change',
    "var $$a=" + value + "," +
        '$$el=$event.target,' +
        "$$c=$$el.checked?(" + trueValueBinding + "):(" + falseValueBinding + ");" +
    'if(Array.isArray($$a)){' +
      "var $$v=" + (number ? '_n(' + valueBinding + ')' : valueBinding) + "," +
          '$$i=_i($$a,$$v);' +
      "if($$el.checked){$$i<0&&(" + (genAssignmentCode(value, '$$a.concat([$$v])')) + ")}" +
      "else{$$i>-1&&(" + (genAssignmentCode(value, '$$a.slice(0,$$i).concat($$a.slice($$i+1))')) + ")}" +
    "}else{" + (genAssignmentCode(value, '$$c')) + "}",
    null, true
  );
}
```
可以看到,checkbox类型的input会调用genCheckboxModel, genCheckboxModel就是在ast的props属性中添加checked值,
以及events属性中添加change值.checkbox是需要runtime的.进过model函数处理后ast变成了下面的内容

```javascript
{
    "type": 1,
    "tag": "input",
    "attrsList": [{ "name": "type", "value": "checkbox" }, { "name": "v-model", "value": "test" }],
    "attrsMap": { "type": "checkbox", "v-model": "test" },
    "children": [],
    "plain": false,
    "attrs": [{ "name": "type", "value": "\"checkbox\"" }],
    "hasBindings": true,
    "directives": [{ "name": "model", "rawName": "v-model", "value": "test", "arg": null }],
    "static": false,
    "staticRoot": false,
    "props": [{ "name": "checked", "value": "Array.isArray(test)?_i(test,null)>-1:(test)" }],
    "events": {
        "change": {
            "value": "var $$a=test,$$el=$event.target,$$c=$$el.checked?(true):(false);if(Array.isArray($$a)){var $$v=null,$$i=_i($$a,$$v);if($$el.checked){$$i<0&&(test=$$a.concat([$$v]))}else{$$i>-1&&(test=$$a.slice(0,$$i).concat($$a.slice($$i+1)))}}else{test=$$c}"
        }
    }
}
```
因为checkbox是需要runtime的,所以上面render函数中的directives生成出来了.然后是attrs通过ast中的attrs生成出来,domProps通过ast中props生成出来,on属性来自于下面这段代码
```javascript
// event handlers
if (el.events) {
  data += (genHandlers(el.events, false, state.warn)) + ",";
}

function genHandlers (
  events,
  isNative,
  warn
) {
  var res = isNative ? 'nativeOn:{' : 'on:{';
  for (var name in events) {
    res += "\"" + name + "\":" + (genHandler(name, events[name])) + ",";
  }
  return res.slice(0, -1) + '}'
}
```
可以看到genHandlers会遍历events,生成每个每个事件的handler
```javascript
function genHandler (
  name,
  handler
) {
  if (!handler) {
    return 'function(){}'
  }

  if (Array.isArray(handler)) {
    return ("[" + (handler.map(function (handler) { return genHandler(name, handler); }).join(',')) + "]")
  }

  var isMethodPath = simplePathRE.test(handler.value);
  var isFunctionExpression = fnExpRE.test(handler.value);

  if (!handler.modifiers) {
    if (isMethodPath || isFunctionExpression) {
      return handler.value
    }
    /* istanbul ignore if */
    return ("function($event){" + (handler.value) + "}") // inline statement
  } else {
    var code = '';
    var genModifierCode = '';
    var keys = [];
    for (var key in handler.modifiers) {
      if (modifierCode[key]) {
        genModifierCode += modifierCode[key];
        // left/right
        if (keyCodes[key]) {
          keys.push(key);
        }
      } else if (key === 'exact') {
        var modifiers = (handler.modifiers);
        genModifierCode += genGuard(
          ['ctrl', 'shift', 'alt', 'meta']
            .filter(function (keyModifier) { return !modifiers[keyModifier]; })
            .map(function (keyModifier) { return ("$event." + keyModifier + "Key"); })
            .join('||')
        );
      } else {
        keys.push(key);
      }
    }
    if (keys.length) {
      code += genKeyFilter(keys);
    }
    // Make sure modifiers like prevent and stop get executed after key filtering
    if (genModifierCode) {
      code += genModifierCode;
    }
    var handlerCode = isMethodPath
      ? ("return " + (handler.value) + "($event)")
      : isFunctionExpression
        ? ("return (" + (handler.value) + ")($event)")
        : handler.value;
    /* istanbul ignore if */
    return ("function($event){" + code + handlerCode + "}")
  }
}
```
我们这种简单情况,会执行这段代码来生成handler
```javascript
return ("function($event){" + (handler.value) + "}") // inline statement
```
至此所有的代码就生成出来了.render函数会生成vnode, _c的第二个参数就是VnodeData.它会在patch.js中的createElm函数中用到.
```javascript
createChildren(vnode, children, insertedVnodeQueue)
if (isDef(data)) {
  invokeCreateHooks(vnode, insertedVnodeQueue)
}
insert(parentElm, vnode.elm, refElm)
```
重点在invokeCreateHooks, invokeCreateHooks会遍历create hooks来处理VnodeData里的不同数据. 首先是
updateAttrs hook,

```javascript
function updateAttrs (oldVnode, vnode) {
  var opts = vnode.componentOptions;
  if (isDef(opts) && opts.Ctor.options.inheritAttrs === false) {
    return
  }
  if (isUndef(oldVnode.data.attrs) && isUndef(vnode.data.attrs)) {
    return
  }
  var key, cur, old;
  var elm = vnode.elm;
  var oldAttrs = oldVnode.data.attrs || {};
  var attrs = vnode.data.attrs || {};
  // clone observed objects, as the user probably wants to mutate it
  if (isDef(attrs.__ob__)) {
    attrs = vnode.data.attrs = extend({}, attrs);
  }

  for (key in attrs) {
    cur = attrs[key];
    old = oldAttrs[key];
    if (old !== cur) {
      setAttr(elm, key, cur);
    }
  }
  // #4391: in IE9, setting type can reset value for input[type=radio]
  // #6666: IE/Edge forces progress value down to 1 before setting a max
  /* istanbul ignore if */
  if ((isIE || isEdge) && attrs.value !== oldAttrs.value) {
    setAttr(elm, 'value', attrs.value);
  }
  for (key in oldAttrs) {
    if (isUndef(attrs[key])) {
      if (isXlink(key)) {
        elm.removeAttributeNS(xlinkNS, getXlinkProp(key));
      } else if (!isEnumeratedAttr(key)) {
        elm.removeAttribute(key);
      }
    }
  }
}
```
将oldVnode 和新的vnode的 attrs 比较然后更新元素的Attribute. 然后是updateDOMListeners

```javascript
function updateDOMListeners (oldVnode, vnode) {
  if (isUndef(oldVnode.data.on) && isUndef(vnode.data.on)) {
    return
  }
  var on = vnode.data.on || {};
  var oldOn = oldVnode.data.on || {};
  target$1 = vnode.elm;
  normalizeEvents(on);
  updateListeners(on, oldOn, add$1, remove$2, vnode.context);
  target$1 = undefined;
}
```
将oldVnode 和新的vnode的 on 比较然后更新元素的Listeners; 接下来是updateDOMProps
```javascript
function updateDOMProps (oldVnode, vnode) {
  if (isUndef(oldVnode.data.domProps) && isUndef(vnode.data.domProps)) {
    return
  }
  var key, cur;
  var elm = vnode.elm;
  var oldProps = oldVnode.data.domProps || {};
  var props = vnode.data.domProps || {};
  // clone observed objects, as the user probably wants to mutate it
  if (isDef(props.__ob__)) {
    props = vnode.data.domProps = extend({}, props);
  }

  for (key in oldProps) {
    if (isUndef(props[key])) {
      elm[key] = '';
    }
  }
  for (key in props) {
    cur = props[key];
    // ignore children if the node has textContent or innerHTML,
    // as these will throw away existing DOM nodes and cause removal errors
    // on subsequent patches (#3360)
    if (key === 'textContent' || key === 'innerHTML') {
      if (vnode.children) { vnode.children.length = 0; }
      if (cur === oldProps[key]) { continue }
      // #6601 work around Chrome version <= 55 bug where single textNode
      // replaced by innerHTML/textContent retains its parentNode property
      if (elm.childNodes.length === 1) {
        elm.removeChild(elm.childNodes[0]);
      }
    }

    if (key === 'value') {
      // store value as _value as well since
      // non-string values will be stringified
      elm._value = cur;
      // avoid resetting cursor position when value is the same
      var strCur = isUndef(cur) ? '' : String(cur);
      if (shouldUpdateValue(elm, strCur)) {
        elm.value = strCur;
      }
    } else {
      elm[key] = cur;
    }
  }
}
```
可以看出逻辑也是更新,并处理了key为textContent, textContent, value 的特殊情况. 最后是updateDirectives
```javascript
function updateDirectives (oldVnode, vnode) {
  if (oldVnode.data.directives || vnode.data.directives) {
    _update(oldVnode, vnode);
  }
}

function _update (oldVnode, vnode) {
  var isCreate = oldVnode === emptyNode;
  var isDestroy = vnode === emptyNode;
  var oldDirs = normalizeDirectives$1(oldVnode.data.directives, oldVnode.context);
  var newDirs = normalizeDirectives$1(vnode.data.directives, vnode.context);

  var dirsWithInsert = [];
  var dirsWithPostpatch = [];

  var key, oldDir, dir;
  for (key in newDirs) {
    oldDir = oldDirs[key];
    dir = newDirs[key];
    if (!oldDir) {
      // new directive, bind
      callHook$1(dir, 'bind', vnode, oldVnode);
      if (dir.def && dir.def.inserted) {
        dirsWithInsert.push(dir);
      }
    } else {
      // existing directive, update
      dir.oldValue = oldDir.value;
      callHook$1(dir, 'update', vnode, oldVnode);
      if (dir.def && dir.def.componentUpdated) {
        dirsWithPostpatch.push(dir);
      }
    }
  }

  if (dirsWithInsert.length) {
    var callInsert = function () {
      for (var i = 0; i < dirsWithInsert.length; i++) {
        callHook$1(dirsWithInsert[i], 'inserted', vnode, oldVnode);
      }
    };
    if (isCreate) {
      mergeVNodeHook(vnode, 'insert', callInsert);
    } else {
      callInsert();
    }
  }

  if (dirsWithPostpatch.length) {
    mergeVNodeHook(vnode, 'postpatch', function () {
      for (var i = 0; i < dirsWithPostpatch.length; i++) {
        callHook$1(dirsWithPostpatch[i], 'componentUpdated', vnode, oldVnode);
      }
    });
  }

  if (!isCreate) {
    for (key in oldDirs) {
      if (!newDirs[key]) {
        // no longer present, unbind
        callHook$1(oldDirs[key], 'unbind', oldVnode, oldVnode, isDestroy);
      }
    }
  }
}
```
记得我们上面说过v-model用于checkbox的input需要runtime, 并且生成了
```javascript
directives: [{ name: 'model', rawName: 'v-model', value: test, expression: 'test' }]
```
是因为v-model用于原生的input的时候有专门的指令定义.所以normalizeDirectives会找出对应model directive 的定义
然后调用相应指令定义的hook,model directive 定义了两个hook
```javascript
{
  inserted() {},
  componentUpdated() {}
}
```
在初始创建时,我们会在当前vnode 的insert hook执行时才去调用指令的insert hook. 那么model 的insert 做了什么呢?
```javascript
inserted (el, binding, vnode, oldVnode) {
    if (vnode.tag === 'select') {
      // #6903
      if (oldVnode.elm && !oldVnode.elm._vOptions) {
        mergeVNodeHook(vnode, 'postpatch', () => {
          directive.componentUpdated(el, binding, vnode)
        })
      } else {
        setSelected(el, binding, vnode.context)
      }
      el._vOptions = [].map.call(el.options, getValue)
    } else if (vnode.tag === 'textarea' || isTextInputType(el.type)) {
      el._vModifiers = binding.modifiers
      if (!binding.modifiers.lazy) {
        el.addEventListener('compositionstart', onCompositionStart)
        el.addEventListener('compositionend', onCompositionEnd)
        // Safari < 10.2 & UIWebView doesn't fire compositionend when
        // switching focus before confirming composition choice
        // this also fixes the issue where some browsers e.g. iOS Chrome
        // fires "change" instead of "input" on autocomplete.
        el.addEventListener('change', onCompositionEnd)
        /* istanbul ignore if */
        if (isIE9) {
          el.vmodel = true
        }
      }
    }
  }
```
显然,我们会执行第二个分支.监听元素的change事件,然后调用onCompositionEnd函数.
```javascript
function onCompositionEnd (e) {
  // prevent triggering an input event for no reason
  if (!e.target.composing) return
  e.target.composing = false
  trigger(e.target, 'input')
}
```
可以看到,onCompositionEnd最终会触发元素的input事件, 前面的updateDOMListeners也监听了元素的change事件.
第一个用例,test为boolean,根据下面的代码

```
checked: Array.isArray(test) ? _i(test, null) > -1 : test
```
checked 为test的值.如果我们点击这个元素,触发它的change事件,根据下面的代码
```javascript
function($event) {
    var $$a = test,
        $$el = $event.target,
        $$c = $$el.checked ? true : false;
    if (Array.isArray($$a)) {
       ...
    } else {
        test = $$c;
    }
}
```
会将对应的test变量设置为元素是否checked的值.
第二个用例加上true-value和false-value的props.用来自定义checkbox的真值和假值.render函数中domProps会变为

```javascript
{ checked: Array.isArray(test) ? _i(test, null) > -1 : :_q(test, a) }
```
只有当test和a相同时checked才会为true. 同时on.change变为
```javascript
function($event) {
    var $$a = test,
        $$el = $event.target,
        $$c = $$el.checked ? a : b;
    if (Array.isArray($$a)) {
        var $$v = null,
            $$i = _i($$a, $$v);
        if ($$el.checked) {
            $$i < 0 && (test = $$a.concat([$$v]));
        } else {
            $$i > -1 && (test = $$a.slice(0, $$i).concat($$a.slice($$i + 1)));
        }
    } else {
        test = $$c;
    }
}
```
因此当触发元素的changed事件时, 如果checked为true, 将test设为对应的a值,反之设为b值.
v-model可以绑定一个数组.从第三个用例可以看出.此时domProps为

```javascript
domProps: { checked: Array.isArray(test) ? _i(test, '1') > -1 : test }
```
如果test为array,判断'1'是否在test中来判断checked的值. 如果触发changed事件.会去取test中value prop所在的索引.如果元素的checked为true且索引为-1,将value prop插入test.如果元素checked为false且索引大于-1,删除test中的value prop.
最后一个要讲的用例是.number modifier.如果template为

```javascript
<input type="checkbox" v-model.number="test" value="1">
```
on.change函数中的$$v值为
```javascript
var $$v=_n("1");
```
因此number modifier会将value prop转成number;




