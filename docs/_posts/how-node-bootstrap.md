---
date: 2019-6-16
tags:
  - JavaScript
  - node
author: Clay
location: shanghai
---

# how nodejs bootstrap

你是否想过nodejs和浏览器端的js有什么区别.为什么有些方法在nodejs中没有,而在浏览器端却有,如dom api.又比如我们在node和浏览器端都可以用setTimeout和setInterval,两者是否一样,属于js标准的一部分.还是两个平台用js引擎实现了自己的timer.我对这些问题充满了疑问, 所以决定从node的源码入手以对这些问题有更清晰的了解.node源码主要有JavaScript, c++/c, python组成.其中python主要用于工具.如编译,测试.c++在大学学过,但是毕业这些年都在写前端.所以基本都忘记了.正好可以通过node的源码学习c++.作为基本没接触过c++过的人,node的编译系统对我来说还是比较困难.经过一段时间的对c++编译相关的工具了解, 如make, 生成各种工程文件的gyp, 着重速度的gn编译工具.对node编译过程有了大概的了解.node现在主要使用node-gyp来生成makefile. configure.py这个python脚本接收不同的编译参数来生成对应的makefile.下面两个链接可以帮你开始编译和调试node.bootstrap的过程中有很多细节,这篇文章只会提到我感兴趣的部分.

[Code of Conduct](https://github.com/nodejs/node/blob/master/CONTRIBUTING.md)\
[tips-and-tricks-node-core](https://joyeecheung.github.io/blog/2018/12/31/tips-and-tricks-node-core/)

写下自己所了解的一方面是记录自己的学习过程.另一方面也希望可以帮到别人.我们都知道c++有entry point(如main函数),node的entry point是node.cc中的start函数.start函数一开始调用了InitializeOncePerProcess函数.这个函数主要对node和v8作初始化处理.其中重点要讲到的是初始化node.因为在初始化node的函数(InitializeNodeWithArgs)中注册了js端会用到的c++模块(调用binding::RegisterBuiltinModules()).这部分的逻辑在node_binding.cc中,先来看看binding::RegisterBuiltinModules做了什么?
```c++
void RegisterBuiltinModules() {
#define V(modname) _register_##modname();
  NODE_BUILTIN_MODULES(V)
#undef V
}
```
这里用了c++的宏去处理注册node的c++模块的功能,NODE_BUILTIN_MODULES这个宏又包含了不同类别的宏
```
#define NODE_BUILTIN_MODULES(V)
  NODE_BUILTIN_STANDARD_MODULES(V)
  NODE_BUILTIN_OPENSSL_MODULES(V)
  NODE_BUILTIN_ICU_MODULES(V)
  NODE_BUILTIN_REPORT_MODULES(V)
  NODE_BUILTIN_PROFILER_MODULES(V)
  NODE_BUILTIN_DTRACE_MODULES(V)
```
经过c++的预处理后,就会变成下面的函数体,
```c++
void RegisterBuiltinModules() {
  _register_async_wrap();
  _register_buffer();
  _register_cares_wrap();
  _register_config();
  ....
}
```
但是这些函数又定义在什么地方呢?如果你在node_binding.cc中搜索NODE_BUILTIN_MODULES,你会发现NODE_BUILTIN_MODULES这个宏还用来声明了这些模块的注册函数,而且注释也告诉了我们实行在什么地方.
```
This is only forward declaration.The definitions are in each module's implementation when calling the NODE_MODULE_CONTEXT_AWARE_INTERNAL.
```
通过这段话,我们确实可以看到很多cc文件末尾用到了NODE_MODULE_CONTEXT_AWARE_INTERNAL这个宏,如node_buffer.cc,node_config.cc,node_crypto.cc等等.那我们继续看这个这个宏做了什么.

```
#define NODE_MODULE_CONTEXT_AWARE_INTERNAL(modname, regfunc)
  NODE_MODULE_CONTEXT_AWARE_CPP(modname, regfunc, nullptr, NM_F_INTERNAL)

#define NODE_MODULE_CONTEXT_AWARE_CPP(modname, regfunc, priv, flags)
  static node::node_module _module = {
      NODE_MODULE_VERSION,
      flags,
      nullptr,
      __FILE__,
      nullptr,
      (node::addon_context_register_func)(regfunc),
      NODE_STRINGIFY(modname),
      priv,
      nullptr};
  void _register_##modname() { node_module_register(&_module); }

```
拿node_buffer.cc来说,这段代码``NODE_MODULE_CONTEXT_AWARE_INTERNAL(buffer, node::Buffer::Initialize)``经过这个宏的扩展就会变成下面这样

```
static node::node_module _module = {
  NODE_MODULE_VERSION,
  NM_F_INTERNAL,
  nullptr,
  __FILE__,
  nullptr,
  (node::addon_context_register_func)(node::Buffer::Initialize),
  NODE_STRINGIFY(buffer),
  nullptr,
  nullptr
}
void _register_buffer() { node_module_register(&_module); }
```
继续看_register_buffer又调用了在node_binging.cc中的node_module_register,

```
// Globals per process
static node_module* modlist_internal;

extern "C" void node_module_register(void* m) {
  struct node_module* mp = reinterpret_cast<struct node_module*>(m);

  if (mp->nm_flags & NM_F_INTERNAL) {
    mp->nm_link = modlist_internal;
    modlist_internal = mp;
  } else if (!node_is_initialized) {
    // "Linked" modules are included as part of the node project.
    // Like builtins they are registered *before* node::Init runs.
    mp->nm_flags = NM_F_LINKED;
    mp->nm_link = modlist_linked;
    modlist_linked = mp;
  } else {
    uv_key_set(&thread_local_modpending, mp);
  }
}
```
现在只看node module为internal的情况,那这个函数基本的操作就是将新的node module插到modlist_internal这个链表的前面.到此我们就知道了node的c++模块保存在modlist_internal这个链表中了,后面要用到的时候就会去这里查找了.

RegisterBuiltinModules讲完后,回到start函数,接下来重要的部分就是创建了一个NodeMainInstance,然后调用了NodeMainInstance的run方法,NodeMainInstance的构造函数做了什么先不考虑.先看run方法做了什么.

```c++
int NodeMainInstance::Run() {
  Locker locker(isolate_);
  Isolate::Scope isolate_scope(isolate_);
  HandleScope handle_scope(isolate_);

  int exit_code = 0;
  std::unique_ptr<Environment> env = CreateMainEnvironment(&exit_code);

  CHECK_NOT_NULL(env);
  Context::Scope context_scope(env->context());

  if (exit_code == 0) {
    {
      AsyncCallbackScope callback_scope(env.get());
      env->async_hooks()->push_async_ids(1, 0);
      LoadEnvironment(env.get());
      env->async_hooks()->pop_async_id(1);
    }

    {
      SealHandleScope seal(isolate_);
      bool more;
      env->performance_state()->Mark(
          node::performance::NODE_PERFORMANCE_MILESTONE_LOOP_START);
      do {
        uv_run(env->event_loop(), UV_RUN_DEFAULT);

        per_process::v8_platform.DrainVMTasks(isolate_);

        more = uv_loop_alive(env->event_loop());
        if (more && !env->is_stopping()) continue;

        env->RunBeforeExitCallbacks();

        if (!uv_loop_alive(env->event_loop())) {
          EmitBeforeExit(env.get());
        }

        // Emit `beforeExit` if the loop became alive either after emitting
        // event, or after running some callbacks.
        more = uv_loop_alive(env->event_loop());
      } while (more == true && !env->is_stopping());
      env->performance_state()->Mark(
          node::performance::NODE_PERFORMANCE_MILESTONE_LOOP_EXIT);
    }

    env->set_trace_sync_io(false);
    exit_code = EmitExit(env.get());
    WaitForInspectorDisconnect(env.get());
  }

  env->set_can_call_into_js(false);
  env->stop_sub_worker_contexts();
  uv_tty_reset_mode();
  env->RunCleanup();
  RunAtExit(env.get());

  per_process::v8_platform.DrainVMTasks(isolate_);
  per_process::v8_platform.CancelVMTasks(isolate_);

#if defined(LEAK_SANITIZER)
  __lsan_do_leak_check();
#endif

  return exit_code;
}
```
run方法里先调用CreateMainEnvironment创建了Environment(我认为是node里连接不同模块的核心Class),CreateMainEnvironment里先是创建了context,然后创建了一个unique_ptr的Environment指针,再通过新创建的指针初始化了libuv(跨平台异步io库, 通过这个库我们可以知道node的event loop到底是怎么回事),以及处理命令行参数.接下来比较关心的部分就是开始bootstrap内部js了.
```c++
if (RunBootstrapping(env.get()).IsEmpty()) {
    *exit_code = 1;
}
```

```c++
MaybeLocal<Value> RunBootstrapping(Environment* env) {
  CHECK(!env->has_run_bootstrapping_code());

  EscapableHandleScope scope(env->isolate());
  Isolate* isolate = env->isolate();
  Local<Context> context = env->context();

  ...

  // Add a reference to the global object
  Local<Object> global = context->Global();

  ...

  Local<Object> process = env->process_object();

  // Setting global properties for the bootstrappers to use:
  // - global
  // Expose the global object as a property on itself
  // (Allows you to set stuff on `global` from anywhere in JavaScript.)
  global->Set(context, FIXED_ONE_BYTE_STRING(env->isolate(), "global"), global)
      .Check();

  // Store primordials setup by the per-context script in the environment.
  Local<Object> per_context_bindings;
  Local<Value> primordials;
  if (!GetPerContextExports(context).ToLocal(&per_context_bindings) ||
      !per_context_bindings->Get(context, env->primordials_string())
           .ToLocal(&primordials) ||
      !primordials->IsObject()) {
    return MaybeLocal<Value>();
  }
  env->set_primordials(primordials.As<Object>());

  ...

  // Create binding loaders
  std::vector<Local<String>> loaders_params = {
      env->process_string(),
      FIXED_ONE_BYTE_STRING(isolate, "getLinkedBinding"),
      FIXED_ONE_BYTE_STRING(isolate, "getInternalBinding"),
      env->primordials_string()};
  std::vector<Local<Value>> loaders_args = {
      process,
      env->NewFunctionTemplate(binding::GetLinkedBinding)
          ->GetFunction(context)
          .ToLocalChecked(),
      env->NewFunctionTemplate(binding::GetInternalBinding)
          ->GetFunction(context)
          .ToLocalChecked(),
      env->primordials()};

  // Bootstrap internal loaders
  MaybeLocal<Value> loader_exports = ExecuteBootstrapper(
      env, "internal/bootstrap/loaders", &loaders_params, &loaders_args);
  if (loader_exports.IsEmpty()) {
    return MaybeLocal<Value>();
  }

  Local<Object> loader_exports_obj =
      loader_exports.ToLocalChecked().As<Object>();
  Local<Value> internal_binding_loader =
      loader_exports_obj->Get(context, env->internal_binding_string())
          .ToLocalChecked();
  env->set_internal_binding_loader(internal_binding_loader.As<Function>());

  Local<Value> require =
      loader_exports_obj->Get(context, env->require_string()).ToLocalChecked();
  env->set_native_module_require(require.As<Function>());

  // process, require, internalBinding, isMainThread,
  // ownsProcessState, primordials
  std::vector<Local<String>> node_params = {
      env->process_string(),
      env->require_string(),
      env->internal_binding_string(),
      FIXED_ONE_BYTE_STRING(isolate, "isMainThread"),
      FIXED_ONE_BYTE_STRING(isolate, "ownsProcessState"),
      env->primordials_string()};
  std::vector<Local<Value>> node_args = {
      process,
      require,
      internal_binding_loader,
      Boolean::New(isolate, env->is_main_thread()),
      Boolean::New(isolate, env->owns_process_state()),
      env->primordials()};

  MaybeLocal<Value> result = ExecuteBootstrapper(
      env, "internal/bootstrap/node", &node_params, &node_args);

  Local<Object> env_var_proxy;
  if (!CreateEnvVarProxy(context, isolate, env->as_callback_data())
           .ToLocal(&env_var_proxy) ||
      process
          ->Set(env->context(),
                FIXED_ONE_BYTE_STRING(env->isolate(), "env"),
                env_var_proxy)
          .IsNothing())
    return MaybeLocal<Value>();

  // Make sure that no request or handle is created during bootstrap -
  // if necessary those should be done in pre-execution.
  // TODO(joyeecheung): print handles/requests before aborting
  CHECK(env->req_wrap_queue()->IsEmpty());
  CHECK(env->handle_wrap_queue()->IsEmpty());

  env->set_has_run_bootstrapping_code(true);

  return scope.EscapeMaybe(result);
}
```
在node中我们可以用global对象,那么这个是怎么实现的呢,这个功能来自这里
```c++
 // Setting global properties for the bootstrappers to use:
  // - global
  // Expose the global object as a property on itself
  // (Allows you to set stuff on `global` from anywhere in JavaScript.)
  global->Set(context, FIXED_ONE_BYTE_STRING(env->isolate(), "global"), global)
      .Check();
```
就像是给这个context的global设置了一个代理属性,通过在js端对这个修改这个代理属性从而改变底层的global.

之后RunBootstrapping开始执行``internal/bootstrap/loaders``这个js,这个js上面的注释比较清楚的解释了这个文件的作用,注意最后的注释.
```
// This file is compiled as if it's wrapped in a function with arguments
// passed by node::RunBootstrapping()
/* global process, getLinkedBinding, getInternalBinding, primordials */
```
可以看出这个js被包裹在一个函数中,这个函数接收四个参数.这四个参数哪里来的呢?再回到c++端.
```c++
// Create binding loaders
  std::vector<Local<String>> loaders_params = {
      env->process_string(),
      FIXED_ONE_BYTE_STRING(isolate, "getLinkedBinding"),
      FIXED_ONE_BYTE_STRING(isolate, "getInternalBinding"),
      env->primordials_string()};
  std::vector<Local<Value>> loaders_args = {
      process,
      env->NewFunctionTemplate(binding::GetLinkedBinding)
          ->GetFunction(context)
          .ToLocalChecked(),
      env->NewFunctionTemplate(binding::GetInternalBinding)
          ->GetFunction(context)
          .ToLocalChecked(),
      env->primordials()};

  // Bootstrap internal loaders
  MaybeLocal<Value> loader_exports = ExecuteBootstrapper(
      env, "internal/bootstrap/loaders", &loaders_params, &loaders_args);
```
loaders_params是接收的参数的字符串形式,loaders_args是接收的参数的真正对象.process参数就是我们所熟知的node里的process,getLinkedBinding和getInternalBinding用来在js端获取c++模块,两者都是v8里的functionTemplate.v8可以通过objectTempalte和functionTemplate来实现js和c++的交互.最后primordials是常用的js内置对象,防止被用户端修改.

这里讲下getInternalBinding做了什么,还记得前面提到的RegisterBuiltinModules吗,这个方法就与它相关.这个函数可以从js端调用传入c++模块的名称.然后通过``get_internal_module``这个方法找到这个node_module,核心就是下面这个函数

```c++
inline struct node_module* FindModule(struct node_module* list,
                                      const char* name,
                                      int flag) {
  struct node_module* mp;

  for (mp = list; mp != nullptr; mp = mp->nm_link) {
    if (strcmp(mp->nm_modname, name) == 0) break;
  }

  CHECK(mp == nullptr || (mp->nm_flags & flag) != 0);
  return mp;
}
```
基本上就是一个链表查询,通过node_module里的nm_modname和传入的name相比较找到对应结果.找到模块后,我们还要初始化这个模块,这就``InitModule``所做的事情.
```c++
static Local<Object> InitModule(Environment* env,
                                node_module* mod,
                                Local<String> module) {
  Local<Object> exports = Object::New(env->isolate());
  // Internal bindings don't have a "module" object, only exports.
  CHECK_NULL(mod->nm_register_func);
  CHECK_NOT_NULL(mod->nm_context_register_func);
  Local<Value> unused = Undefined(env->isolate());
  mod->nm_context_register_func(exports, unused, env->context(), mod->nm_priv);
  return exports;
}
```
这个函数也很简单,调用node_module里的nm_context_register_func函数将结果exports返回.还是举node_buffer这个例子,
```c++

void Initialize(Local<Object> target,
                Local<Value> unused,
                Local<Context> context,
                void* priv) {
  Environment* env = Environment::GetCurrent(context);

  env->SetMethod(target, "setBufferPrototype", SetBufferPrototype);
  env->SetMethodNoSideEffect(target, "createFromString", CreateFromString);

  env->SetMethodNoSideEffect(target, "byteLengthUtf8", ByteLengthUtf8);
  env->SetMethod(target, "copy", Copy);
  ...
}
```
调用这个函数后,exports就包含了setBufferPrototype, createFromString,copy等函数.最终GetInternalBinding也是将这个exports返回.这里还有两个分支没有讲到,模块constants和natives,有兴趣可以自行研究下.

接下来就可以看看loaders.js这个文件了,首先它在process下定义了moduleLoadList这个属性来表示加载的module,然后定义了
process.binding()能获取的c++模块,然后定义了process.binding和process._linkedBinding,这两个方法分别使用getInternalBinding和getLinkedBinding,getInternalBinding上面又包了一层internalBinding,因为这个未过滤的方法内部用到了很多.
```c++
internalBinding = function internalBinding(module) {
    let mod = bindingObj[module];
    if (typeof mod !== 'object') {
      mod = bindingObj[module] = getInternalBinding(module);
      moduleLoadList.push(`Internal Binding ${module}`);
    }
    return mod;
  };
```
再然后就是设置NativeModule,关于它的用途可以看下这段注释
```
// Internal JavaScript module loader:
// - NativeModule: a minimal module system used to load the JavaScript core
//   modules found in lib/**/*.js and deps/**/*.js. All core modules are
//   compiled into the node binary via node_javascript.cc generated by js2c.py,
//   so they can be loaded faster without the cost of I/O. This class makes the
//   lib/internal/*, deps/internal/* modules and internalBinding() available by
//   default to core modules, and lets the core modules require itself via
//   require('internal/bootstrap/loaders') even when this file is not written in
//   CommonJS style.
```

基本上node里所有的js都会js2c.py生成的node_javascript.cc转存为二进制数据.这样做是为了加载更快.

NativeModule主要包含了文件名,id,exports,loaded,loading,canBeRequiredByUsers等数据.
canBeRequiredByUsers用来标记这个nativeModule能否被用户require,如果已--expose-internals这个flag运行node. NativeModule.map里的所有module都会被用户require. nativeModule.map来自于native_module.cc暴露出来的moduleIds.

```c++
const {
  moduleIds,
  compileFunction
} = internalBinding('native_module');

NativeModule.map = new Map();
for (var i = 0; i < moduleIds.length; ++i) {
  const id = moduleIds[i];
  const mod = new NativeModule(id);
  NativeModule.map.set(id, mod);
}
```
这个文件返回值
```javascript
// Think of this as module.exports in this file even though it is not
// written in CommonJS style.
const loaderExports = {
  internalBinding,
  NativeModule,
  require: nativeModuleRequire
};
```
我们了解了两个,再来看最后一个nativeModuleRequire,

```js
function nativeModuleRequire(id) {
  if (id === loaderId) {
    return loaderExports;
  }

  const mod = NativeModule.map.get(id);
  return mod.compile();
}
```
根据传入的id,从NativeModule.map中获取nativeModule,然后调用它的compile方法.
```js
NativeModule.prototype.compile = function() {
  if (this.loaded || this.loading) {
    return this.exports;
  }

  const id = this.id;
  this.loading = true;

  try {
    const requireFn = this.id.startsWith('internal/deps/') ?
      requireWithFallbackInDeps : nativeModuleRequire;

    const fn = compileFunction(id);
    fn(this.exports, requireFn, this, process, internalBinding, primordials);

    this.loaded = true;
  } finally {
    this.loading = false;
  }

  moduleLoadList.push(`NativeModule ${id}`);
  return this.exports;
};
```
这个函数大概就是通过native_module.cc里的compileFunction函数将对应js包裹成接收6个参数的函数,分别为这个module的exports,nativeModuleRequire获者requireWithFallbackInDeps,这个module自身,process,internalBinding,primordials,然后调用这个函数,修改moduleLoadList,返回module的exports.

loaders.js bootstrap完后,利用返回的结果,继续bootstrap``internal/bootstrap/node``这个文件
```c++
  // process, require, internalBinding, isMainThread,
  // ownsProcessState, primordials
  std::vector<Local<String>> node_params = {
      env->process_string(),
      env->require_string(),
      env->internal_binding_string(),
      FIXED_ONE_BYTE_STRING(isolate, "isMainThread"),
      FIXED_ONE_BYTE_STRING(isolate, "ownsProcessState"),
      env->primordials_string()};
  std::vector<Local<Value>> node_args = {
      process,
      require,
      internal_binding_loader,
      Boolean::New(isolate, env->is_main_thread()),
      Boolean::New(isolate, env->owns_process_state()),
      env->primordials()};

  MaybeLocal<Value> result = ExecuteBootstrapper(
      env, "internal/bootstrap/node", &node_params, &node_args);
```
能看到internalBinding和require就是bootstrap loaders.js后返回的结果.在node.js中也可以看到它们是怎么使用的
```
const config = internalBinding('config');
const { deprecate } = require('internal/util');
````
这个文件主要做setup工作,如process的一些方法,全局timer的定义等,async_wrap的hook等.

node.js bootstrap完成后,然后设置了process的env属性.RunBootstrapping基本就结束了.

回到NodeMainInstance::Run, Environment创建完后开始跟node使用者相关了

```c++
{
      AsyncCallbackScope callback_scope(env.get());
      env->async_hooks()->push_async_ids(1, 0);
      LoadEnvironment(env.get());
      env->async_hooks()->pop_async_id(1);
}
```
async_hooks用来追踪node的异步资源.重点看LoadEnvironment,

```c++
void LoadEnvironment(Environment* env) {
  CHECK(env->is_main_thread());
  // TODO(joyeecheung): Not all of the execution modes in
  // StartMainThreadExecution() make sense for embedders. Pick the
  // useful ones out, and allow embedders to customize the entry
  // point more directly without using _third_party_main.js
  USE(StartMainThreadExecution(env));
}
```

LoadEnvironment检查了是否是主线程,然后调用StartMainThreadExecution. 这个函数根据不同的命令行参数,调用了``internal/main``下不同的js,如repl模式和调试模式,我们现在只看最常用的使用模式 node index.js. 如果是这中运行命令,就会执行下面的代码

```c++
if (!first_argv.empty() && first_argv != "-") {
  return StartExecution(env, "internal/main/run_main_module");
}
```
StartExecution的代码

```c++
MaybeLocal<Value> StartExecution(Environment* env, const char* main_script_id) {
  EscapableHandleScope scope(env->isolate());
  CHECK_NOT_NULL(main_script_id);

  std::vector<Local<String>> parameters = {
      env->process_string(),
      env->require_string(),
      env->internal_binding_string(),
      env->primordials_string(),
      FIXED_ONE_BYTE_STRING(env->isolate(), "markBootstrapComplete")};

  std::vector<Local<Value>> arguments = {
      env->process_object(),
      env->native_module_require(),
      env->internal_binding_loader(),
      env->primordials(),
      env->NewFunctionTemplate(MarkBootstrapComplete)
          ->GetFunction(env->context())
          .ToLocalChecked()};

  Local<Value> result;
  if (!ExecuteBootstrapper(env, main_script_id, &parameters, &arguments)
           .ToLocal(&result) ||
      !task_queue::RunNextTicksNative(env)) {
    return MaybeLocal<Value>();
  }
  return scope.Escape(result);
}
```

可以看到我们bootstrap了``internal/main/run_main_module.js``这个文件,传入的参数为process,native_module_require,internalBinding,primordials,markBootstrapComplete.

接下来就来看看run_main_module.js做了什么,里面的代码很少,重点是这两行代码

```js
...
const CJSModule = require('internal/modules/cjs/loader');
...
CJSModule.runMain();
```

这段代码使用native_module_require去加载``internal/modules/cjs/loader``,然后调用runMain执行程序.

runMain做了什么呢,上部分是与es6模块相关的内容,我们只看最后一句
```js
Module._load(process.argv[1], null, true);
```

_load主要做的就是找到对应的文件名,如果缓存存在,取缓存,然后判断是否是NativeModule,如果是,则调用NativeModule的compileForPublicLoader的方法,并且返回,如果不是,则创建一个Module,用这个Module实例的load方法去加载这个模块,最后返回这个模块的exports.那load方法做了什么呢?

```js
// Given a file name, pass it to the proper extension handler.
Module.prototype.load = function(filename) {
  debug('load %j for module %j', filename, this.id);

  assert(!this.loaded);
  this.filename = filename;
  this.paths = Module._nodeModulePaths(path.dirname(filename));

  const extension = findLongestRegisteredExtension(filename);
  Module._extensions[extension](this, filename);
  this.loaded = true;
  ...
};
```
这里同样省略了es6模块的内容.可以看到这段代码表示用对应扩展名的方法去处理这个文件.扩展名可以有js,json,node,mjs.我们看js的方法.
```
// Native extension for .js
Module._extensions['.js'] = function(module, filename) {
  const content = fs.readFileSync(filename, 'utf8');
  module._compile(stripBOM(content), filename);
};
```

这个方法读取了这个文件的内容,然后用Module实例的_compile方法去编译这个文件.

```js
// Run the file contents in the correct scope or sandbox. Expose
// the correct helper variables (require, module, exports) to
// the file.
// Returns exception, if any.
Module.prototype._compile = function(content, filename) {
  ...
  content = stripShebang(content);

  let compiledWrapper;

  compiledWrapper = compileFunction(
    content,
    filename,
    0,
    0,
    undefined,
    false,
    undefined,
    [],
    [
      'exports',
      'require',
      'module',
      '__filename',
      '__dirname',
    ]
  );

  const dirname = path.dirname(filename);
  const require = makeRequireFunction(this);
  var result;
  const exports = this.exports;
  const thisValue = exports;
  const module = this;
  ...
  result = compiledWrapper.call(thisValue, exports, require, module,
                                  filename, dirname);
  return result;
};
```
上面的代码省略了一些细节内容,可以看到这个函数也是将文件编译成一个接受参数的函数,然后执行这个函数.从这里我们也可以看出module和module.exports的区别,exports只是module.exports的引用.也就明白了为什么不能在一个node模块中重新赋值exports了.再来看看这个require又是什么.

```js
// Invoke with makeRequireFunction(module) where |module| is the Module object
// to use as the context for the require() function.
function makeRequireFunction(mod) {
  const Module = mod.constructor;

  function require(path) {
    return mod.require(path);
  }

  function resolve(request, options) {
    validateString(request, 'request');
    return Module._resolveFilename(request, mod, false, options);
  }

  require.resolve = resolve;

  function paths(request) {
    validateString(request, 'request');
    return Module._resolveLookupPaths(request, mod);
  }

  resolve.paths = paths;

  require.main = process.mainModule;

  // Enable support to add extra extension types.
  require.extensions = Module._extensions;

  require.cache = Module._cache;

  return require;
}
```

这个require是以Module实例为context的,调用这个这个require,会调用Module.prototype.require,
```js
// Loads a module at the given file path. Returns that module's
// `exports` property.
Module.prototype.require = function(id) {
  validateString(id, 'id');
  if (id === '') {
    throw new ERR_INVALID_ARG_VALUE('id', id,
                                    'must be a non-empty string');
  }
  requireDepth++;
  try {
    return Module._load(id, this, /* isMain */ false);
  } finally {
    requireDepth--;
  }
};
```
可以看到这个函数只是Module._load的的一个封装,加上参数的检查和requireDepth的处理.

ok, 回到NodeMainInstance::Run(),LoadEnvironment(env.get())执行完后,开始进入大家熟知的event_loop;

```c++
do {
  uv_run(env->event_loop(), UV_RUN_DEFAULT);

  per_process::v8_platform.DrainVMTasks(isolate_);

  more = uv_loop_alive(env->event_loop());
  if (more && !env->is_stopping()) continue;

  env->RunBeforeExitCallbacks();

  if (!uv_loop_alive(env->event_loop())) {
    EmitBeforeExit(env.get());
  }

  // Emit `beforeExit` if the loop became alive either after emitting
  // event, or after running some callbacks.
  more = uv_loop_alive(env->event_loop());
} while (more == true && !env->is_stopping());
```
整个event_loop的核心就是uv_run, uv_run会依次执行timers的回调,pending的回调,idle回调,prepare回调,然后就是poll,这个是block的,poll结束后执行check回调,最后执行closing_handles.如果整个loop没有refed和活跃的handle或req时,loop就会退出.这也是为什么有时候你的node程序不退出的原因,因为一直有相关的handle存在.loop退出后,node然后做一些清理工作,整个过程基本就结束了.

event_loop还有很多细节没了解清楚,后续可能会更新libuv这方面的内容.希望这篇文章对你们了解node启动的大概过程有帮助.

最后贴一个v8相关概念的链接
[Getting started with embedding V8](https://v8.dev/docs/embed)