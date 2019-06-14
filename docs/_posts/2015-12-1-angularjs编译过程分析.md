---
date: 2015-12-01
tags:
  - JavaScript
  - angular
author: Clay
location: shenzhen
---

# angularjs 编译过程分析

本文将分析angularjs的构建过程,代码结构。

首先我们分析他的build过程,对于代码量很大的项目，都会分文件管理，我在刚开始阅读这种源代码时会有很大的迷惑感，从src到最后给用户的版本经过了怎样的过程。除了src之外，其他文件夹及文件有什么作用，这些都可以给我们做项目提供很好的思路。

首先在根目录下，有很多以.开头的文件,如.editorconfig,.jscsrc,.travis.yml等,这些称为dotfile,是配置文件,editorconfig是用来配置编辑器的,使项目在所有编辑器中都有一致的格式。jscsrc是用来配置代码风格，比如airbnb的style guide就很受欢迎。travis是用来配置自动化测试的。还有很多包含conf的文件是用来配置测试文件的。

其中最重要就是gruntfile.js，它包含了项目的编译信息，我们只研究其中的build和min任务。

```js
build: {
     scenario: {
       dest: 'build/angular-scenario.js',
       src: [
         'bower_components/jquery/dist/jquery.js',
         util.wrap([files['angularSrc'], files['angularScenario']], 'ngScenario/angular')
       ],
       styles: {
         css: ['css/angular.css', 'css/angular-scenario.css']
       }
     },
     angular: {
       dest: 'build/angular.js',
       src: util.wrap([files['angularSrc']], 'angular'),
       styles: {
         css: ['css/angular.css'],
         generateCspCssFile: true,
         minify: true
       }
     },
     loader: {
       dest: 'build/angular-loader.js',
       src: util.wrap(files['angularLoader'], 'loader')
     },
     touch: {
       dest: 'build/angular-touch.js',
       src: util.wrap(files['angularModules']['ngTouch'], 'module')
     },
     mocks: {
       dest: 'build/angular-mocks.js',
       src: util.wrap(files['angularModules']['ngMock'], 'module'),
       strict: false
     },
     sanitize: {
       dest: 'build/angular-sanitize.js',
       src: util.wrap(files['angularModules']['ngSanitize'], 'module')
     },
     resource: {
       dest: 'build/angular-resource.js',
       src: util.wrap(files['angularModules']['ngResource'], 'module')
     },
     messageformat: {
       dest: 'build/angular-message-format.js',
       src: util.wrap(files['angularModules']['ngMessageFormat'], 'module')
     },
     messages: {
       dest: 'build/angular-messages.js',
       src: util.wrap(files['angularModules']['ngMessages'], 'module')
     },
     animate: {
       dest: 'build/angular-animate.js',
       src: util.wrap(files['angularModules']['ngAnimate'], 'module')
     },
     route: {
       dest: 'build/angular-route.js',
       src: util.wrap(files['angularModules']['ngRoute'], 'module')
     },
     cookies: {
       dest: 'build/angular-cookies.js',
       src: util.wrap(files['angularModules']['ngCookies'], 'module')
     },
     aria: {
       dest: 'build/angular-aria.js',
       src: util.wrap(files['angularModules']['ngAria'], 'module')
     },
     "promises-aplus-adapter": {
       dest:'tmp/promises-aplus-adapter++.js',
       src:['src/ng/q.js','lib/promises-aplus/promises-aplus-test-adapter.js']
     }
   }
```

这里面有不同的选项，用于配置不同的任务，比如我只想bulid angular核心文件，我可以在控制台运行grunt bulid:angular.

接口:
```js
grunt.registerMultiTask('min', 'minify JS files', function(){
	util.min.call(util, this.data, this.async());
});
grunt.registerMultiTask('build', 'build JS files', function(){
	util.build.call(util, this.data, this.async());
});
```

build函数:
```js
build: function(config, fn){
    var files = grunt.file.expand(config.src);
    var styles = config.styles;
    var processedStyles;
    //concat
    var src = files.map(function(filepath) {
      return grunt.file.read(filepath);
    }).join(grunt.util.normalizelf('\n'));
    //process
    var processed = this.process(src, grunt.config('NG_VERSION'), config.strict);
    if (styles) {
      processedStyles = this.addStyle(processed, styles.css, styles.minify);
      processed = processedStyles.js;
      if (config.styles.generateCspCssFile) {
        grunt.file.write(removeSuffix(config.dest) + '-csp.css', CSP_CSS_HEADER + processedStyles.css);
      }
    }
    //write
    grunt.file.write(config.dest, processed);
    grunt.log.ok('File ' + config.dest + ' created.');
    fn();
	function removeSuffix(fileName) {
      return fileName.replace(/\.js$/, '');
    }
},
```

min函数：
```
min: function(file, done) {
  var classPathSep = (process.platform === "win32") ? ';' : ':';
  var minFile = file.replace(/\.js$/, '.min.js');
  var mapFile = minFile + '.map';
  var mapFileName = mapFile.match(/[^\/]+$/)[0];
  var errorFileName = file.replace(/\.js$/, '-errors.json');
  var versionNumber = grunt.config('NG_VERSION').full;
  var compilationLevel = (file === 'build/angular-message-format.js') ?
      'ADVANCED_OPTIMIZATIONS' : 'SIMPLE_OPTIMIZATIONS';
  shell.exec(
      'java ' +
          this.java32flags() + ' ' +
          this.memoryRequirement() + ' ' +
          '-cp bower_components/closure-compiler/compiler.jar' + classPathSep +
          'bower_components/ng-closure-runner/ngcompiler.jar ' +
          'org.angularjs.closurerunner.NgClosureRunner ' +
          '--compilation_level ' + compilationLevel + ' ' +
          '--language_in ECMASCRIPT5_STRICT ' +
          '--minerr_pass ' +
          '--minerr_errors ' + errorFileName + ' ' +
          '--minerr_url http://errors.angularjs.org/' + versionNumber + '/ ' +
          '--source_map_format=V3 ' +
          '--create_source_map ' + mapFile + ' ' +
          '--js ' + file + ' ' +
          '--js_output_file ' + minFile,
    function(code) {
      if (code !== 0) grunt.fail.warn('Error minifying ' + file);

      // closure creates the source map relative to build/ folder, we need to strip those references
      grunt.file.write(mapFile, grunt.file.read(mapFile).replace('"file":"build/', '"file":"').
                                                         replace('"sources":["build/','"sources":["'));

      // move add use strict into the closure + add source map pragma
      grunt.file.write(minFile, this.sourceMap(mapFileName, this.singleStrict(grunt.file.read(minFile), '\n')));
      grunt.log.ok(file + ' minified into ' + minFile);
      done();
  }.bind(this));
	},
```

在我运行grunt build:angular时,bulid函数里config就是
```js
{
       dest: 'build/angular.js',
       src: util.wrap([files['angularSrc']], 'angular'),
       styles: {
         css: ['css/angular.css'],
         generateCspCssFile: true,
         minify: true
       }
}
```

这里面的src用到了files[‘angularSrc’]，其中files来自angularFiles.js 的exports,这其中的内容是angular中所有文件的路径，你要对文件进行操作，肯定要知道路径。util.wrap将
angular.prefix和angular.suffix添加到路径中。

build函数的大概就是读取每个路径中的内容，让后中间用换行符连在一起。有styles，就将css加入其中，如果需要生成csp（content security policy）css 文件。生成此文件。

min函数的大概就是google的closure compiler将文件进行最小化，其中shell函数就是此命令，这一长串内容都是参数，如源文件，内存要求，还有生成source map等。