var fs   = require('fs')
var join = require('path').join

var applyPatches  = require('diff').applyPatches
var async         = require('async')
var checksums     = require('download-checksum').checksums
var extract       = require('tar-fs').extract
var forceArray    = require('force-array');
var got           = require('got')
var gunzip        = require('gunzip-maybe')
var Multiprogress = require('multi-progress')
var rimraf        = require('rimraf')
var stripDirs     = require('strip-dirs')


const CI = process.env.CI


function noop(){}


function getAction(item, deps)
{
  // Item has an action
  var action = item.action
  if(action) action = action.bind(item)

  // No patch, return plain action (if any)
  var patch = item.patch
  if(!patch) return action

  // Download and apply patch before exec action (if any)
  var name  = item .name
  var path  = patch.path  || item.path  || ''
  var strip = patch.strip || item.strip || 0
  var url   = patch.url   || patch

  function loadFile(patch, callback)
  {
    var filename = stripDirs(patch.oldFileName, strip)
    fs.readFile(join(deps, name, path, filename), 'utf8', callback)
  }

  function patched(patch, content)
  {
    if(content === false)
      return console.error('Context sanity check failed:',patch)

    var filename = stripDirs(patch.newFileName, strip)
    fs.writeFile(join(deps, name, path, filename), content)
  }

  return function(callback)
  {
    function complete(error)
    {
      if(error) return callback(error)

      if(action) return action(callback)

      callback()
    }

    got(url, function(error, patch)
    {
      if(error) return callback(error)

      applyPatches(patch,
      {
        loadFile: loadFile,
        patched : patched,
        complete: complete
      })
    })
  }
}

function getName(item)
{
  return item.name
}

function getNames(downloads)
{
  var names = downloads.map(getName)
  var last  = names.pop()

  var result = names.join(', ')

  if(names.length) result += ' and '

  return result + last
}


function manager(downloads, options, callback)
{
  if(options instanceof Function)
  {
    callback = options
    options = {}
  }

  downloads = forceArray(downloads)

  var deps = options.path || '.'

  var errors = []
  var transferred = 0
  var length = 0

  var multi = Multiprogress()


  function download(item, callback)
  {
    got.stream.get(item.url)
    .on('error', callback)
    .on('response', function(res)
    {
      const path = join(deps, item.name)

      var _error

      // var self = this
      function onError(error, callback)
      {
        if(!error) return

        _error = error
        errors.push(error)

        // self.abort()
        res.once('end', function()
        {
          rimraf(path, callback || noop)
        })
      }

//      checksums(res, item, onError)

      // const contentLength = res.headers['content-length']
      // if(!CI && contentLength != null)
      // {
      //   var bar = multi.newBar(item.name+' [:bar] :percent :etas',
      //   {
      //     incomplete: ' ',
      //     width: 50,
      //     total: parseInt(contentLength, 10)
      //   })
      //   res.on('data', function(chunk)
      //   {
      //     bar.tick(chunk.length)
      //   })
      // }

//      pump(res, gunzip(), extract(path, {strip: 1}), function(error)
      res.on('error', onError)
      res.pipe(gunzip()).pipe(extract(path, {strip: 1}))
      .on('error', onError)
      .on('finish', callback)
      // .on('finish', function()
      // {
      //   var action = getAction(item, deps)
      //
      //   console.trace('action 1:',item, action, callback)
      //   if(_error || !action) return callback()
      //   console.log('action 2:')
      //
      //   action(function(error)
      //   {
      //     console.log('action 3:',error)
      //     if(error) return onError(error, callback)
      //
      //     callback()
      //   })
      // })
    })
  }


  // async.reject(downloads, function(item, callback)
  // {
  //   fs.exists(join(deps, item.name), callback)
  // },
  // function(downloads)
  // {
    if(!downloads.length) return callback()

    process.stdout.write('Downloading '+getNames(downloads)+'... ')

    async.each(downloads, download, function(error)
    {
      console.log('each:',error, errors)
      if(error) return callback(error)

      if(errors.length) return callback(errors)

      if(CI) console.log('Done')

      callback()
    })
//  })
}


module.exports = manager
