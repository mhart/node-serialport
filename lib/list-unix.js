'use strict';
var async = require('async');
var exec = require('child_process').exec;
var fs = require('fs');
var path = require('path');

function udev_output_to_json(output) {
  var result = {};
  var lines = output.split('\n');
  lines.forEach(function(line) {
    if (!line || line.trim() === '') {
      return;
    }
    var line_parts = line.trim().split('=');
    var key = line_parts[0].trim().toLowerCase();
    result[key] = line_parts[1].trim();
  });
  return result;
}

function udev_parser(udev_output) {
  var as_json = udev_output_to_json(udev_output);

  var pnpId;
  if (as_json.devlinks) {
    as_json.devlinks.split(' ').forEach(function(path) {
      if (path.indexOf('/by-id/') === -1) { return }
      pnpId = path.substring(path.lastIndexOf('/') + 1);
    });
  }

  var vendorId = as_json.id_vendor_id;
  if (vendorId && vendorId.substring(0, 2) !== '0x') {
    vendorId = '0x' + vendorId;
  }

  var productId = as_json.id_model_id;
  if (productId && productId.substring(0, 2) !== '0x') {
    productId = '0x' + productId;
  }

  return {
    comName: as_json.devname,
    manufacturer: as_json.id_vendor,
    serialNumber: as_json.id_serial,
    pnpId: pnpId,
    vendorId: vendorId,
    productId: productId
  };
}

function listUnix(callback) {
  var dirName = '/dev';

  fs.readdir(dirName, function (err, files) {
    if (err) {
      // if this directory is not found this could just be because it's not plugged in
      if (err.errno === 34) {
        return callback(null, []);
      }
      return callback(err);
    }

    // get only serial port names
    // TODO statSync is bad bad bad
    for (var i = files.length - 1; i >= 0; i--) {
      if (
          (files[i].indexOf('ttyS') === -1 &&
            files[i].indexOf('ttyACM') === -1 &&
            files[i].indexOf('ttyUSB') === -1 &&
            files[i].indexOf('ttyAMA') === -1 &&
            files[i].indexOf('ttyMFD') === -1) ||
          !fs.statSync(path.join(dirName, files[i])).isCharacterDevice()
        ) {
        files.splice(i, 1);
      }
    }

    async.map(files, function (file, callback) {
      var fileName = path.join(dirName, file);
      var udevadm = 'udevadm info --query=property -p $(udevadm info -q path -n ' + fileName + ')';
      exec(udevadm, function (err, stdout) {
        if (err) {
          return callback(err);
        }
        callback(null, udev_parser(stdout));
      });
    }, callback);
  });
}

module.exports = listUnix;
