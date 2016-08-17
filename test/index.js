const assert   = require('assert')
const readFile = require('fs').readFile

const dir  = require('tmp').dir.bind(null, {unsafeCleanup: true})
const nock = require('nock')

const manager = require('..')

nock.disableNetConnect();
nock.enableNetConnect('127.0.0.1');


const A_SHA256 = 'dca3a19d32399b8654d78d83002a096df48ad6e7087f4d1bd22eeabb6d49ba32'
const B_SHA256 = '90e533b073521133e59ef5ec77b4863fd9343cc7e5a4bd43203bc8abe88d3e01'


const server = nock('http://example.org')

const downloads =
[
  {
    name: 'a_dir',
    url: 'http://example.org/a.tar.gz',
    sha256: A_SHA256,
    strip: 1
  },
  {
    name: 'b_dir',
    url: 'http://example.org/b.tar.gz',
    sha256: B_SHA256,
    strip: 1
  }
]


it('download and decompress one file', function(done)
{
  dir(function(error, path, cleanupCallback)
  {
    assert.ifError(error)

    server.get('/a.tar.gz').replyWithFile(200, __dirname + '/fixtures/a.tar.gz',
    {'Content-Length': 169})

    manager(downloads[0], {path}, function(error)
    {
      assert.ifError(error)

      readFile(path+'/a_dir/a1.txt', 'utf8', function(error, data)
      {
        assert.ifError(error)

        assert.strictEqual(data, 'asdf\n')

        cleanupCallback()
        done()
      })
    })
  })
})

it('download and decompress two files', function(done)
{
  dir(function(error, path, cleanupCallback)
  {
    assert.ifError(error)

    server.get('/a.tar.gz').replyWithFile(200, __dirname + '/fixtures/a.tar.gz',
    {'Content-Length': 169})
    server.get('/b.tar.gz').replyWithFile(200, __dirname + '/fixtures/b.tar.gz',
    {'Content-Length': 173})

    manager(downloads, {path}, function(error)
    {
      assert.ifError(error)

      readFile(path+'/a_dir/a1.txt', 'utf8', function(error, data)
      {
        assert.ifError(error)

        assert.strictEqual(data, 'asdf\n')

        readFile(path+'/b_dir/b1.txt', 'utf8', function(error, data)
        {
          assert.ifError(error)

          assert.strictEqual(data, 'qwerty\n')

          cleanupCallback()
          done()
        })
      })
    })
  })
})
