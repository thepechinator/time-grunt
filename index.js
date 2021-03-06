'use strict';
var chalk = require('chalk');
var table = require('text-table');
var hooker = require('hooker');
var dateTime = require('date-time');
var prettyMs = require('pretty-ms');
var barChar = require('figures').square;
var argv = process.argv.slice(2);

var write = process.stdout.write.bind(process.stdout);

var fs = require('fs');
var path = require('path');
var extend = require('util-extend');

function log(str) {
	write(str + '\n', 'utf8');
}

module.exports = function (grunt) {
	var now = new Date();
	var startTimePretty = dateTime();
	var startTime = now.getTime();
	var prevTime = startTime;
	var prevTaskName = 'loading tasks';
	var tableData = [];

	if (argv.indexOf('--help') !== -1 ||
		argv.indexOf('-h') !== -1 ||
		argv.indexOf('--version') !== -1 ||
		argv.indexOf('-V') !== -1) {
		return;
	}

    // Format for the colors config check taken from 
    // https://github.com/karl-sjogren/jshint-stylish-ex/blob/master/stylish.js
    var colors = {};
    if (fs.existsSync(path.resolve('.chalkcolors'))) {
        var rc = fs.readFileSync('.chalkcolors', {encoding: 'utf8'});
        colors = JSON.parse(rc);
    }

    colors = extend({
        'bar': 'blue',
        'total': 'magenta',
        'time': 'gray'
    }, colors);    

	// crazy hack to work around stupid node-exit
	// Can this be removed now that node-exit#4 has been resolved?
	// https://github.com/cowboy/node-exit/issues/4
	var originalExit = process.exit;

	function exit(exitCode) {
		clearInterval(interval);
		process.emit('timegruntexit', exitCode);
		exit = function () {};
	}

	var interval = setInterval(function () {
		process.exit = exit;
	}, 100);
	process.exit = exit;

	hooker.hook(grunt.log, 'header', function () {
		var name = grunt.task.current.nameArgs;
		var diff = Date.now() - prevTime;

		if (prevTaskName && prevTaskName !== name) {
			tableData.push([prevTaskName, diff]);
		}

		prevTime = Date.now();
		prevTaskName = name;
	});

	function formatTable(tableData) {
		var totalTime = Date.now() - startTime;

		var longestTaskName = tableData.reduce(function (acc, row) {
			var avg = row[1] / totalTime;
			if (avg < 0.01 && !grunt.option('verbose')) {
				return acc;
			}
			return Math.max(acc, row[0].length);
		}, 0);

		var maxColumns = process.stdout.columns || 80;
		var maxBarWidth;

		if (longestTaskName > maxColumns / 2) {
			maxBarWidth = (maxColumns - 20) / 2;
		} else {
			maxBarWidth = maxColumns - (longestTaskName + 20);
		}

		function shorten(taskName) {
			var nameLength = taskName.length;

			if (nameLength <= maxBarWidth) {
				return taskName;
			}

			var partLength = Math.floor((maxBarWidth - 3) / 2);
			var start = taskName.substr(0, partLength + 1);
			var end = taskName.substr(nameLength - partLength);
			return start.trim() + '...' + end.trim();
		}

		function createBar(percentage) {
			var rounded = Math.round(percentage * 100);

			if (rounded === 0) {
				return '0%';
			}

			var barLength = Math.ceil(maxBarWidth * percentage) + 1;
			var bar = new Array(barLength).join(barChar);
			return bar + ' ' + rounded + '%';
		}

		var tableDataProcessed = tableData.map(function (row) {
			var avg = row[1] / totalTime;
			if (avg < 0.01 && !grunt.option('verbose')) {
				return;
			}
			return [shorten(row[0]), chalk[colors.bar](prettyMs(row[1])), chalk[colors.bar](createBar(avg))];
		}).reduce(function (acc, row) {
			if (row) {
				acc.push(row);
				return acc;
			}
			return acc;
		}, []);

		tableDataProcessed.push([chalk[colors.total]('Total', prettyMs(totalTime))]);

		return table(tableDataProcessed, {
			align: [ 'l', 'r', 'l' ],
			stringLength: function (str) {
				return chalk.stripColor(str).length;
			}
		});
	}

	process.on('SIGINT', function () {
		process.exit();
	});

	process.once('timegruntexit', function (exitCode) {
		clearInterval(interval);
		process.exit = originalExit;

		hooker.unhook(grunt.log, 'header');

		var diff = Date.now() - prevTime;
		if (prevTaskName) {
			tableData.push([prevTaskName, diff]);
		}

		// `grunt.log.header` should be unhooked above, but in some cases it's not
		log('\n\n' + chalk.underline('Execution Time') + chalk[colors.time](' (' + startTimePretty + ')'));
		log(formatTable(tableData) + '\n');
		process.exit(exitCode);
	});
};
