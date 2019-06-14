---
date: 2018-12-15
tags:
  - JavaScript
  - vue
  - vue-loader
author: Clay
location: shanghai
---
# how vue loader works

我相信很多人都通过.vue文件来写过组件.但是你们有想过vue文件是怎么通过webpack打包的?大部分可能都会知道是通过vue-loader处理的.这边文章会介绍下我所了解的vue-loader,底层的一些细节我不会覆盖.(欢迎纠错)

首先我们看下vue-loader的文件结构:

```
lib
   --- codegen
   	  --- customBlocks.js
   	  --- hotReload.js
   	  --- styleInjection.js
   	  --- utils.js
   --- loaders
      --- pitcher.js
      --- stylePostLoader.js
      --- templateLoader.js
   --- runtime
   	  --- componentNormalizer.js
   index.js
   plugin.js
   select.js
```

vue-loader 为webpack提供了一个loader(index.js)和plugin(plugin.js).在webpack中loader用来转变asset,如js,css,scss,file等.plugin可以hook进webpack整个构建的过程. plugin比loader能做的事更多.它需要你对webpack内部工作原理有一定的了解.我们来看看vue-loader的plugin做了什么.插件主要是替换了webpack compiler 的 rules选项.

```javascript
const pitcher = {
  loader: require.resolve('./loaders/pitcher'),
  resourceQuery: query => {
    const parsed = qs.parse(query.slice(1))
    return parsed.vue != null
  },
  options: {
    cacheDirectory: vueLoaderUse.options.cacheDirectory,
    cacheIdentifier: vueLoaderUse.options.cacheIdentifier
  }
}
```

第一条rule引用了loaders文件夹下的pitcher.js, 在pitcher.js中exports了一个loader函数,这个loader函数没做任何事,只是简单的返回了输入.重要的是loader函数的pitch属性.下面是对pitch loader的介绍(摘自webpack文档)

> Loaders are **always** called from right to left. There are some instances where the loader only cares about the **metadata** behind a request and can ignore the results of the previous loader. The `pitch` method on loaders is called from **left to right** before the loaders are actually executed (from right to left). For the following [`use`](https://webpack.js.org/configuration/module#rule-use) configuration:

列如:

```javascript
module.exports = {
  //...
  module: {
    rules: [
      {
        //...
        use: [
          'a-loader',
          'b-loader',
          'c-loader'
        ]
      }
    ]
  }
};
```

上面的loader执行顺序为

```diff
|- a-loader `pitch`
  |- b-loader `pitch`
    |- c-loader `pitch`
      |- requested module is picked up as a dependency
    |- c-loader normal execution
  |- b-loader normal execution
|- a-loader normal execution
```

如果一个loader在pitch方法中返回结果.那么这个过程会跳过剩下的loaders.如果上面的b-loader的pitch方法返回了结果.那么loader的执行过程会变成下面的样子

```diff
|- a-loader `pitch`
  |- b-loader `pitch` returns a module
|- a-loader normal execution
```

回到vue-loader的pitch方法.这个方法就是将vue文件中不同板块的query转化成对应的request.

Query type 为style生成如下模块

```
const request = genRequest([
    ...afterLoaders,
    stylePostLoaderPath,
    ...beforeLoaders
])
// console.log(request)
return `import mod from ${request}; export default mod; export * from ${request}`
```

query type 为template 生成如下模块

```
const request = genRequest([
  ...cacheLoader,
  templateLoaderPath + `??vue-loader-options`,
  ...loaders
])
// console.log(request)
// the template compiler uses esm exports
return `export * from ${request}`
```

然后再来看loader.loader 分为两部分,如果query有type, 选择对应的模块返回,反之对每个模块进行处理生成对应的请求.vue-loader 中有个example文件夹,我们可以以这个为列子讲解整个流程.

最开始的request 是 ```.../vue-loader/lib/index.js??vue-loader-options!/.../vue-loader/example/source.vue```, 也就是source.vue会经过index.js的处理.此时query没有type.index.js会将source.vue处理成下面的内容

```javascript
import { render, staticRenderFns } from "./source.vue?vue&type=template&id=27e4e96e&lang=pug&"
import script from "./source.vue?vue&type=script&lang=js&"
export * from "./source.vue?vue&type=script&lang=js&"
import style0 from "./source.vue?vue&type=style&index=0&module=true&lang=css&"

var cssModules = {}
var disposed = false

function injectStyles (context) {
  if (disposed) return
  
        cssModules["$style"] = (style0.locals || style0)
        Object.defineProperty(this, "$style", {
          get: function () {
            return cssModules["$style"]
          }
        })
      
}


  module.hot && module.hot.dispose(function (data) {
    disposed = true
  })



        module.hot && module.hot.accept(["./source.vue?vue&type=style&index=0&module=true&lang=css&"], function () {
          var oldLocals = cssModules["$style"]
          if (oldLocals) {
            var newLocals = require("./source.vue?vue&type=style&index=0&module=true&lang=css&")
            if (JSON.stringify(newLocals) !== JSON.stringify(oldLocals)) {
              cssModules["$style"] = newLocals
              require("/Users/taylorliu/Projects/vue-loader/node_modules/vue-hot-reload-api/dist/index.js").rerender("27e4e96e")
            }
          }
        })

/* normalize component */
import normalizer from "!../lib/runtime/componentNormalizer.js"
var component = normalizer(
  script,
  render,
  staticRenderFns,
  false,
  injectStyles,
  null,
  null
  
)

/* custom blocks */
import block0 from "./source.vue?vue&type=custom&index=0&blockType=foo"
if (typeof block0 === 'function') block0(component)

/* hot reload */
if (module.hot) {
  var api = require("/Users/taylorliu/Projects/vue-loader/node_modules/vue-hot-reload-api/dist/index.js")
  api.install(require('vue'))
  if (api.compatible) {
    module.hot.accept()
    if (!module.hot.data) {
      api.createRecord('27e4e96e', component.options)
    } else {
      api.reload('27e4e96e', component.options)
    }
    module.hot.accept("./source.vue?vue&type=template&id=27e4e96e&lang=pug&", function () {
      api.rerender('27e4e96e', {
        render: render,
        staticRenderFns: staticRenderFns
      })
    })
  }
}
component.options.__file = "example/source.vue"
export default component.exports
```

经过webpack里面的parser处理,生成新的dependency, 然后处理新的dependency.首先看template,```/source.vue?vue&type=template&id=27e4e96e&lang=pug&```会变成一个webpack module.进过pitch处理后source为 

```javascript
export * from "-!../lib/loaders/templateLoader.js??vue-loader-options!../node_modules/pug-plain-loader/index.js!../lib/index.js??vue-loader-options!./source.vue?vue&type=template&id=27e4e96e&lang=pug&"
```

然后上面又是一个module.先后进过index.js, pug-plain-loader,templateLoader处理.经过index.js处理时query.type为template,因此会走select.js下面的部分

```javascript
if (query.type === `template`) {
    if (appendExtension) {
      loaderContext.resourcePath += '.' + (descriptor.template.lang || 'html')
    }
    loaderContext.callback(
      null,
      descriptor.template.content,
      descriptor.template.map
    )
    return
}
```

基本就是将经过parse后的tempate部分返回.最后会经过templateLoader处理为下面的source

```javascript
var render = function() {
  var _vm = this
  var _h = _vm.$createElement
  var _c = _vm._self._c || _h
  return _c("div", { attrs: { ok: "" } }, [
    _c("h1", { class: _vm.$style.red }, [_vm._v("helloh")])
  ])
}
var staticRenderFns = []
render._withStripped = true

export { render, staticRenderFns }
```

然后是js, ```./source.vue?vue&type=script&lang=js&```会变成一个webpack module,经过pitch处理后source为

```javascript
import mod from "-!../lib/index.js??vue-loader-options!./source.vue?vue&type=script&lang=js&"; export default mod; export * from "-!../lib/index.js??vue-loader-options!./source.vue?vue&type=script&lang=js&"
```

然后```-!../lib/index.js??vue-loader-options!./source.vue?vue&type=script&lang=js&```变成一个module

module的source为

```
//
//

export default {
  data () {
    return {
      msg: 'fesfff'
    }
  }
}
```

然后是style, ```./source.vue?vue&type=style&index=0&module=true&lang=css&```会变成一个webpack module,经过pitch处理后source为

```javascript
import mod from "-!../node_modules/vue-style-loader/index.js!../node_modules/css-loader/index.js??ref--3-oneOf-0-1!../lib/loaders/stylePostLoader.js!../lib/index.js??vue-loader-options!./source.vue?vue&type=style&index=0&module=true&lang=css&"; 
export default mod; 
export * from "-!../node_modules/vue-style-loader/index.js!../node_modules/css-loader/index.js??ref--3-oneOf-0-1!../lib/loaders/stylePostLoader.js!../lib/index.js??vue-loader-options!./source.vue?vue&type=style&index=0&module=true&lang=css&"
```

```-!../node_modules/vue-style-loader/index.js!../node_modules/css-loader/index.js??ref--3-oneOf-0-1!../lib/loaders/stylePostLoader.js!../lib/index.js??vue-loader-options!./source.vue?vue&type=style&index=0&module=true&lang=css&```这个request变成一个module,经过vue-style-loader的pitch处理后source为

```javascript
// style-loader: Adds some css to the DOM by adding a <style> tag

// load the styles
var content = require("!!../node_modules/css-loader/index.js??ref--3-oneOf-0-1!../lib/loaders/stylePostLoader.js!../lib/index.js??vue-loader-options!./source.vue?vue&type=style&index=0&module=true&lang=css&");
if(typeof content === 'string') content = [[module.id, content, '']];
if(content.locals) module.exports = content.locals;
// add the styles to the DOM
var add = require("!../node_modules/vue-style-loader/lib/addStylesClient.js").default
var update = add("1abb52d0", content, false, {});
// Hot Module Replacement
if(module.hot) {
 // When the styles change, update the <style> tags
 if(!content.locals) {
   module.hot.accept("!!../node_modules/css-loader/index.js??ref--3-oneOf-0-1!../lib/loaders/stylePostLoader.js!../lib/index.js??vue-loader-options!./source.vue?vue&type=style&index=0&module=true&lang=css&", function() {
     var newContent = require("!!../node_modules/css-loader/index.js??ref--3-oneOf-0-1!../lib/loaders/stylePostLoader.js!../lib/index.js??vue-loader-options!./source.vue?vue&type=style&index=0&module=true&lang=css&");
     if(typeof newContent === 'string') newContent = [[module.id, newContent, '']];
     update(newContent);
   });
 }
 // When the module is disposed, remove the <style> tags
 module.hot.dispose(function() { update(); });
}
```

然后```../node_modules/css-loader/index.js??ref--3-oneOf-0-1!../lib/loaders/stylePostLoader.js!../lib/index.js??vue-loader-options!./source.vue?vue&type=style&index=0&module=true&lang=css&```成为一个module,经过loader处理后source为

```javascript
exports = module.exports = require("../node_modules/css-loader/lib/css-base.js")(false);
// imports


// module
exports.push([module.id, "\n.red_8O-JgqG1 {\n  color: red;\n}\n", ""]);

// exports
exports.locals = {
	"red": "red_8O-JgqG1"
};
```

最后是custom block,```./source.vue?vue&type=custom&index=0&blockType=foo```进过pitch处理后source

```javascript
import mod from "-!../node_modules/babel-loader/lib/index.js!../lib/index.js??vue-loader-options!./source.vue?vue&type=custom&index=0&blockType=foo"; 
export default mod; export * from "-!../node_modules/babel-loader/lib/index.js!../lib/index.js??vue-loader-options!./source.vue?vue&type=custom&index=0&blockType=foo"
```

```-!../node_modules/babel-loader/lib/index.js!../lib/index.js??vue-loader-options!./source.vue?vue&type=custom&index=0&blockType=foo```成为一个module, 进过loader处理后source为

```
export default (function (comp) {
  console.log(comp.options.data());
});
```

至此,大概的过程就讲完了,当然还有很多细节没讲.因为我也是只是研究了一个大致的流程.有兴趣的可以自行研究.