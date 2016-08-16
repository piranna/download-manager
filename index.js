'use strict'

const fs    = require('fs')
const parse = require('url').parse
const path  = require('path')

const applyPatches  = require('diff').applyPatches
const async         = require('async')
const checksums     = require('download-checksum').checksums
const extract       = require('tar-fs').extract
const forceArray    = require('force-array');
const got           = require('got')
const gunzip        = require('gunzip-maybe')
const Multiprogress = require('multi-progress')
const pump          = require('pump')
const rimraf        = require('rimraf')
const stripDirs     = require('strip-dirs')

const get = got.stream.get


const CI = process.env.CI


function noop(){}


function getAction(item, deps)
{
  var patch = forceArray(item.patch)

  var action = item.action
  if(action)
  {
    action = action.bind(item)
    if(!patch.length) return action
  }

  var name = item.name

  return function(callback)
  {
    async.eachSeries(patch, function(patch, callback)
    {
      var fpath = patch.path  || item.path  || ''
      var strip = patch.strip || item.strip || 0
      var url   = patch.url   || patch

      function loadFile(patch, callback)
      {
        var filename = patch.oldFileName

        if(!path.isAbsolute(filename))
          filename = path.join(deps, name, fpath, stripDirs(filename, strip))

        fs.readFile(filename, 'utf8', callback)
      }

      function patched(patch, content)
      {
        if(content === false)
          return console.error('Context sanity check failed:',patch)

        var filename = patch.newFileName

        if(!path.isAbsolute(filename))
          filename = path.join(deps, name, fpath, stripDirs(filename, strip))

        fs.writeFile(filename, content)
      }

      function complete(error)
      {
        if(error) return callback(error)

        if(action) return action.call(item, callback)

        callback()
      }

      getPatch(url, function(error, patch)
      {
        if(error) return callback(error)

        applyPatches(patch,
        {
          loadFile: loadFile,
          patched : patched,
          complete: complete
        })
      })
    },
    callback)
  }
}

/**
 * Get the name of an `item`
 */
function getName(item)
{
  return item.name
}

/**
 * Get a pretty-printed human readable list of downloads names
 */
function getNames(downloads)
{
  var names = downloads.map(getName)
  var last  = names.pop()

  var result = names.join(', ')

  if(names.length) result += ' and '

  return result + last
}

/**
 * Get a `patch` file both from local filesystem or as a download
 */
function getPatch(url, callback)
{
  if(parse(url).host) return got(url, callback)

  // Local file
  fs.readFile(url, 'utf8', callback)
}


function manager(downloads, options, callback)
{
  downloads = forceArray(downloads)

  if(options instanceof Function)
  {
    callback = options
    options = null
  }
  options = options || {}

  var deps = options.path || '.'


  var errors = []

  var multi = Multiprogress()


  function download(item, callback)
  {
    const fpath = path.join(deps, item.name)

    var _error

    var req = get(item.url)

    function onError(error, callback)
    {
      if(!error) return

      _error = error
      errors.push(error)

      req.abort()
      req.once('end', function()
      {
        rimraf(fpath, callback || noop)
      })
    }

    req.on('response', function(res)
    {
      checksums(res, item, onError)

      const contentLength = res.headers['content-length']
      if(!CI && contentLength != null)
      {
        var bar = multi.newBar(item.name+' [:bar] :percent :etas',
        {
          incomplete: ' ',
          width: 50,
          total: parseInt(contentLength, 10)
        })
        res.on('data', function(chunk)
        {
          bar.tick(chunk.length)
        })
      }
    })

    pump(req, gunzip(), extract(fpath, item), function(error)
    {
      if(error) return onError(error, callback)

      var action = getAction(item, deps)

      if(_error || !action) return callback()

      action(function(error)
      {
        if(error) return onError(error, callback)

        callback()
      })
    })
  }


  async.reject(downloads, function(item, callback)
  {
    fs.exists(path.join(deps, item.name), callback)
  },
  function(error, downloads)
  {
    if(error) return callback(error)

    if(!downloads.length) return callback()

    process.stdout.write('Downloading '+getNames(downloads)+'... ')

    async.each(downloads, download, function(error)
    {
      if(error) return callback(error)

      if(errors.length) return callback(errors)

      if(CI) console.log('Done')

      callback()
    })
  })
}


module.exports = manager
