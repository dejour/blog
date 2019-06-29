---
date: 2019-6-28
tags:
  - JavaScript
  - node
  - timer
author: Clay
location: shanghai
---

# nodejs处理timer的流程

在nodejs中,我们经常会用到setTimeout来让一个函数在一段时间后运行.setTimeout这个函数不属于js标准的一部分,在浏览器端我们能使用是因为浏览器自己实现了这个api.同样的,nodejs也实现了自己的setTimeout.这篇文章让我们来看看nodejs如何处理用户设置的timer.

先来看看setTimeout的代码
```js
function setTimeout(callback, after, arg1, arg2, arg3) {
  if (typeof callback !== 'function') {
    throw new ERR_INVALID_CALLBACK(callback);
  }

  var i, args;
  switch (arguments.length) {
    // fast cases
    case 1:
    case 2:
      break;
    case 3:
      args = [arg1];
      break;
    case 4:
      args = [arg1, arg2];
      break;
    default:
      args = [arg1, arg2, arg3];
      for (i = 5; i < arguments.length; i++) {
        // Extend array dynamically, makes .apply run much faster in v6.0.0
        args[i - 2] = arguments[i];
      }
      break;
  }

  const timeout = new Timeout(callback, after, args, false);
  active(timeout);

  return timeout;
}
```
这个函数先是处理了一下参数,然后生成了Timeout对象并激活这个对象.继续看Timeout对象.
```js
function Timeout(callback, after, args, isRepeat) {
  after *= 1; // Coalesce to number or NaN
  if (!(after >= 1 && after <= TIMEOUT_MAX)) {
    if (after > TIMEOUT_MAX) {
      process.emitWarning(`${after} does not fit into` +
                          ' a 32-bit signed integer.' +
                          '\nTimeout duration was set to 1.',
                          'TimeoutOverflowWarning');
    }
    after = 1; // Schedule on next tick, follows browser behavior
  }

  this._idleTimeout = after;
  this._idlePrev = this;
  this._idleNext = this;
  this._idleStart = null;
  // This must be set to null first to avoid function tracking
  // on the hidden class, revisit in V8 versions after 6.2
  this._onTimeout = null;
  this._onTimeout = callback;
  this._timerArgs = args;
  this._repeat = isRepeat ? after : null;
  this._destroyed = false;

  this[kRefed] = null;

  initAsyncResource(this, 'Timeout');
}
```
这个构造函数创建了一个Timer并设置对象的属性,这些属性后面用到了会讲到.最后一句与async hook有关,表明我们初始化了一个异步资源.
这个函数没有做什么,那么重点就在active上.active的代码如下
```js
function active(item) {
  insert(item, true, getLibuvNow());
}
function insert(item, refed, start) {
  let msecs = item._idleTimeout;
  if (msecs < 0 || msecs === undefined)
    return;

  // Truncate so that accuracy of sub-milisecond timers is not assumed.
  msecs = Math.trunc(msecs);

  item._idleStart = start;

  // Use an existing list if there is one, otherwise we need to make a new one.
  var list = timerListMap[msecs];
  if (list === undefined) {
    debug('no %d list was found in insert, creating a new one', msecs);
    const expiry = start + msecs;
    timerListMap[msecs] = list = new TimersList(expiry, msecs);
    timerListQueue.insert(list);

    if (nextExpiry > expiry) {
      scheduleTimer(msecs);
      nextExpiry = expiry;
    }
  }

  if (!item[async_id_symbol] || item._destroyed) {
    item._destroyed = false;
    initAsyncResource(item, 'Timeout');
  }

  if (refed === !item[kRefed]) {
    if (refed)
      incRefCount();
    else
      decRefCount();
  }
  item[kRefed] = refed;

  L.append(list, item);
}
```
可以看到实际的逻辑在insert中.insert接收三个参数,这个case下,item为刚刚创建的Timeout对象,refed为true(与libuv的handle有关),start为当前时间.
首先设置了Timeout对象的_idleStart为当前时间.然后判断timerListMap这个map是否存在_idleTimeout的list.这里timerListMap就是这个核心数据结构了.
```
 ╔════ > Object Map
 ║
 ╠══
 ║ lists: { '40': { }, '320': { etc } } (keys of millisecond duration)
 ╚══          ┌────┘
              │
 ╔══          │
 ║ TimersList { _idleNext: { }, _idlePrev: (self) }
 ║         ┌────────────────┘
 ║    ╔══  │                              ^
 ║    ║    { _idleNext: { },  _idlePrev: { }, _onTimeout: (callback) }
 ║    ║      ┌───────────┘
 ║    ║      │                                  ^
 ║    ║      { _idleNext: { etc },  _idlePrev: { }, _onTimeout: (callback) }
 ╠══  ╠══
 ║    ║
 ║    ╚════ >  Actual JavaScript timeouts
 ║
 ╚════ > Linked List
```
上面就是这个map的大致结构(摘自源码``lib/internal/timers.js``),建议看看文件的注释以便更好的理解,可以看到_idleNext和_idlePrev这两个字段是用来形成链表的.
回到代码,如果list不存在,我们就创建新的TimersList,TimersList的结构如下
```js
function TimersList(expiry, msecs) {
  this._idleNext = this; // Create the list with the linkedlist properties to
  this._idlePrev = this; // Prevent any unnecessary hidden class changes.
  this.expiry = expiry;
  this.id = timerListId++;
  this.msecs = msecs;
  this.priorityQueuePosition = null;
}
```
其中的expiry和id用来排序.expiry就是这个list中最短的到期timer.然后将这个TimersList插入timerListQueue中,timerListQueue是一个用heap实现的优先队列.
```js
const timerListQueue = new PriorityQueue(compareTimersLists, setPosition);
function compareTimersLists(a, b) {
  const expiryDiff = a.expiry - b.expiry;
  if (expiryDiff === 0) {
    if (a.id < b.id)
      return -1;
    if (a.id > b.id)
      return 1;
  }
  return expiryDiff;
}
```
可以看到id和expiry小的list在这个队列的前面,接下来就是判断我们是否需要重新设置libuv的timer_handle,列如你先设置了一个近的timer,然后又设置一个远的timer,libuv会
先以近的timer执行.然后再将这个timer插入这个list中,这个list也是自然排序,因为timeout一样,插入的顺序就是过期的顺序.从L这个linkedList的实现可以看出我们是依次拿出
最早插入的item,也就是最早过期的timer.到这里设置部分就完成了.接下来就是看触发timer执行的部分.

记得上面我们调用过scheduleTimer这个函数,这个函数会调用``env.cc``里的ScheduleTimer.
```c++
void Environment::ScheduleTimer(int64_t duration_ms) {
  if (started_cleanup_) return;
  uv_timer_start(timer_handle(), RunTimers, duration_ms, 0);
}
```
这个函数会启动env里的timer_handle,回调为RunTimers.libuv中也有一个与timerListQueue类似的优先队列.由uv_timer_t的timeout和start_id决定先后顺序.处理这个队列的部分在
uv_run中
```c++
int uv_run(uv_loop_t* loop, uv_run_mode mode) {
  int timeout;
  int r;
  int ran_pending;

  r = uv__loop_alive(loop);
  if (!r)
    uv__update_time(loop);

  while (r != 0 && loop->stop_flag == 0) {
    uv__update_time(loop);
    uv__run_timers(loop);
    ...
}
```
再来看看uv__run_timers(loop)做了什么
```c++
void uv__run_timers(uv_loop_t* loop) {
  struct heap_node* heap_node;
  uv_timer_t* handle;

  for (;;) {
    heap_node = heap_min(timer_heap(loop));
    if (heap_node == NULL)
      break;

    handle = container_of(heap_node, uv_timer_t, heap_node);
    if (handle->timeout > loop->time)
      break;

    uv_timer_stop(handle);
    uv_timer_again(handle);
    handle->timer_cb(handle);
  }
}
```
不停的从loop的timer_heap中拿出最近heap_node.container_of是基于内存的操作,我们知道heap_node在uv_timer_t的byte offset,就可以知道这个heap_node的uv_timer_t container
的地址.然后移除这个handle,如果这个handle有repeat值,重新插入,最后调用回调.当拿出的heap_node为空,或handle的过期时间大于loop的时间时,跳出循环.

接下来就是看这个RunTimers回调做了什么
```c++
void Environment::RunTimers(uv_timer_t* handle) {
  ...

  Local<Function> cb = env->timers_callback_function();
  MaybeLocal<Value> ret;
  Local<Value> arg = env->GetNow();
  // This code will loop until all currently due timers will process. It is
  // impossible for us to end up in an infinite loop due to how the JS-side
  // is structured.
  do {
    TryCatchScope try_catch(env);
    try_catch.SetVerbose(true);
    ret = cb->Call(env->context(), process, 1, &arg);
  } while (ret.IsEmpty() && env->can_call_into_js());

  // NOTE(apapirovski): If it ever becomes possible that `call_into_js` above
  // is reset back to `true` after being previously set to `false` then this
  // code becomes invalid and needs to be rewritten. Otherwise catastrophic
  // timers corruption will occur and all timers behaviour will become
  // entirely unpredictable.
  if (ret.IsEmpty())
    return;

  // To allow for less JS-C++ boundary crossing, the value returned from JS
  // serves a few purposes:
  // 1. If it's 0, no more timers exist and the handle should be unrefed
  // 2. If it's > 0, the value represents the next timer's expiry and there
  //    is at least one timer remaining that is refed.
  // 3. If it's < 0, the absolute value represents the next timer's expiry
  //    and there are no timers that are refed.
  int64_t expiry_ms =
      ret.ToLocalChecked()->IntegerValue(env->context()).FromJust();

  uv_handle_t* h = reinterpret_cast<uv_handle_t*>(handle);

  if (expiry_ms != 0) {
    int64_t duration_ms =
        llabs(expiry_ms) - (uv_now(env->event_loop()) - env->timer_base());

    env->ScheduleTimer(duration_ms > 0 ? duration_ms : 1);

    if (expiry_ms > 0)
      uv_ref(h);
    else
      uv_unref(h);
  } else {
    uv_unref(h);
  }
}
```
这个函数首先调用timers_callback_function,这个函数就是bootstrap node时从js端传过来的

```js
function processTimers(now) {
  debug('process timer lists %d', now);
  nextExpiry = Infinity;

  let list;
  let ranAtLeastOneList = false;
  while (list = timerListQueue.peek()) {
    if (list.expiry > now) {
      nextExpiry = list.expiry;
      return refCount > 0 ? nextExpiry : -nextExpiry;
    }
    if (ranAtLeastOneList)
      runNextTicks();
    else
      ranAtLeastOneList = true;
    listOnTimeout(list, now);
  }
  return 0;
}
```
这个函数会不停的从timerListQueue中取出timerList.如果取出的list的过期时间大于现在的时间,说明没有timer要处理.返回这个这个list的过期时间,如果没有refed的timer,返回负数.
然后执行listOnTimeout,这个函数会动态改变list在timerListQueue的位置.如果多次循环.会在执行一个list中最后一个timer中nextTick的内容.

接下来看看listOnTimeout.

```js
function listOnTimeout(list, now) {
    const msecs = list.msecs;

    debug('timeout callback %d', msecs);

    var diff, timer;
    let ranAtLeastOneTimer = false;
    while (timer = L.peek(list)) {
      diff = now - timer._idleStart;

      // Check if this loop iteration is too early for the next timer.
      // This happens if there are more timers scheduled for later in the list.
      if (diff < msecs) {
        list.expiry = Math.max(timer._idleStart + msecs, now + 1);
        list.id = timerListId++;
        timerListQueue.percolateDown(1);
        debug('%d list wait because diff is %d', msecs, diff);
        return;
      }

      if (ranAtLeastOneTimer)
        runNextTicks();
      else
        ranAtLeastOneTimer = true;

      // The actual logic for when a timeout happens.
      L.remove(timer);

      const asyncId = timer[async_id_symbol];

      if (!timer._onTimeout) {
        if (timer[kRefed])
          refCount--;
        timer[kRefed] = null;

        if (destroyHooksExist() && !timer._destroyed) {
          emitDestroy(asyncId);
          timer._destroyed = true;
        }
        continue;
      }

      emitBefore(asyncId, timer[trigger_async_id_symbol]);

      let start;
      if (timer._repeat)
        start = getLibuvNow();

      try {
        const args = timer._timerArgs;
        if (args === undefined)
          timer._onTimeout();
        else
          timer._onTimeout(...args);
      } finally {
        if (timer._repeat && timer._idleTimeout !== -1) {
          timer._idleTimeout = timer._repeat;
          if (start === undefined)
            start = getLibuvNow();
          insert(timer, timer[kRefed], start);
        } else if (!timer._idleNext && !timer._idlePrev) {
          if (timer[kRefed])
            refCount--;
          timer[kRefed] = null;

          if (destroyHooksExist() && !timer._destroyed) {
            emitDestroy(timer[async_id_symbol]);
            timer._destroyed = true;
          }
        }
      }

      emitAfter(asyncId);
    }

    // If `L.peek(list)` returned nothing, the list was either empty or we have
    // called all of the timer timeouts.
    // As such, we can remove the list from the object map and
    // the PriorityQueue.
    debug('%d list empty', msecs);

    // The current list may have been removed and recreated since the reference
    // to `list` was created. Make sure they're the same instance of the list
    // before destroying.
    if (list === timerListMap[msecs]) {
      delete timerListMap[msecs];
      timerListQueue.shift();
    }
  }
```

首先,循环从timerList中取timer,如果还没到过期时间,说明后面的timer还没到期,此时修改这个list的过期时间和id,并调整这个list在timerListQueuez中的位置后返回.
接下来,如果至少执行了一次timer,就会执行前一次timer所产生的nextTick.最后就是调用timer的回调,并移除timer,以及与async_hook相关的处理.

这里对repeat的参数,没有做详细的研究,有兴趣的可以看下.

最后回到c++,如果说我们的proccessTimers返回值为0,代表没有timer执行了,可以unref这个env的timer_handle,以便event_loop退出.如果说expiry_ms不为0,说明需要重新
设置env的timer_handle.