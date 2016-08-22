'use strict'

const fs    = require('fs')
const parse = require('url').parse
const path  = require('path')

const applyPatches  = require('diff').applyPatches
const async         = require('async')
const decompress    = require('decompress-maybe')
const checksums     = require('download-checksum').checksums
const extract       = require('tar-fs').extract
const forceArray    = require('force-array');
const got           = require('got')
const Multiprogress = require('multi-progress')
const pump          = require('pump')
const rimraf        = require('rimraf')
const stripDirs     = require('strip-dirs')

const get = got.stream.get

require('string.prototype.padend').shim()


const CI = process.env.CI


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

  function applyPatch(patch, callback)
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
  }


  return async.eachSeries.bind(async, patch, applyPatch)
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
  // Local file
  if(!parse(url).host) return fs.readFile(url, 'utf8', callback)

  // Remote file
  got(url).then(function(response)
  {
    callback(null, response.body)
  },
  callback)
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


  var errors = {}

  var multi = Multiprogress()


  function download(item, callback)
  {
    // [Hack] can't use closures for these variables due to a bug in `got`
    // https://github.com/sindresorhus/got/issues/223
    var req
    var res

    var checksum_error

    var request = get(item.url)
    .on('request', function(_req)
    {
      req = _req
    })
    .on('response', function(_res)
    {
      res = _res

      checksums(res, item, function(error)
      {
        if(!error) return

        checksum_error = error
      })

      const contentLength = res.headers['content-length']
      if(!CI && contentLength != null)
      {
        var bar = multi.newBar(item.namepadded+' [:bar] :percent :etas',
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

    const name  = item.name
    const fpath = path.join(deps, name)

    function errorPurge(error, callback)
    {
      errors[name] = error

      rimraf(fpath, callback)
    }

    pump(request, decompress(), extract(fpath, {strip: 1}), function(error)
    {
      if(error)
      {
        if(res.ended) return errorPurge(error, callback)

        req.once('abort', function()
        {
          errorPurge(error, callback)
        })

        return req.abort()
      }

      if(checksum_error) return errorPurge(checksum_error, callback)

      var action = getAction(item, deps)
      if(!action) return callback()

      action(function(error)
      {
        if(error) return errorPurge(error, callback)

        callback()
      })
    })
  }


  async.filter(downloads, function(item, callback)
  {
    fs.stat(path.join(deps, item.name), function(err, stats)
    {
      if(err && err.code !== 'ENOENT') return callback(err)

      callback(null, err)  // No error (falsy), or error is `ENOENT` (truish)
    })
  },
  function(error, downloads)
  {
    if(error) return callback(error)

    if(!downloads.length) return callback()

    // Compute padded names
    const length = downloads.map(getName)
                   .sort(function(a, b){return b.length - a.length})[0].length

    downloads.forEach(function(item)
    {
      item.namepadded = item.name.padEnd(length)
    })

    process.stdout.write('Downloading '+getNames(downloads)+'... ')

    // Start downloads
    async.each(downloads, download, function(error)
    {
      if(error) return callback(error)

      const keys = Object.keys(errors)
      switch(keys.length)
      {
        case 0:
          if(CI) console.log('Done')

          callback()
        break

        case 1:
          callback(errors[keys[0]])
        break

        default:
          callback(errors)
      }
    })
  })
}


module.exports = manager
