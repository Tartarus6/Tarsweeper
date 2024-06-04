// Minesweeper, the game

// See readme.txt for instructions on installation, configuration, and use

// Tar's Notes:
//
// format documentation [here](https://synchro.net/docs/customization.html)
//
// Code Page 437 cheat sheet [here](https://en.wikipedia.org/wiki/Code_page_437)

"use strict";

// TODO: make something that'll automatically roll over old scores into the new level system

/*
{"rev":"0.6","height":10,"width":10,"mines":10,"start":1715695309.111,"end":1715695322.782,"name":"Tar"}
*/

const title = "Tarsweeper";
const ini_section = "minesweeper";
const REVISION = "$Revision: 0.6 $".split(' ')[1];
const author = "Digital Man";
const header_height = 4;
const winners_list = js.exec_dir + "winners.jsonl";
const losers_list = js.exec_dir + "losers.jsonl";
const help_file = js.exec_dir + "minesweeper.hlp";
const welcome_image = js.exec_dir + "welcome.bin";
const mine_image = js.exec_dir + "mine.bin";
const winner_image = js.exec_dir + "winner.bin";
const boom_image = js.exec_dir + "boom?.bin";
const loser_image = js.exec_dir + "loser.bin";
const max_size_level = 6;
const max_mine_level = 3;
const size_level_multiplier = 5;  // defines the number of cells added to the height per size level, and the base size
const min_mine_density = 0.1;
const mine_density_multiplier = 0.1;
const char_flag = '\x9f';
const char_badflag = '!';
// const char_unsure = '?';
const char_empty = '\xFA'; 
const char_covered = ' ';
const char_mine = '\xEB';
const char_detonated_mine = '*';
const winner_subject = "Winner";
const highscores_subject = "High Scores";
const tear_line = "\r\n--- " + js.exec_file + " " + REVISION + "\r\n";
const selectors = ["()", "[]", "<>", "{}", "--", "  "];

require("sbbsdefs.js", "K_NONE");
require("mouse_getkey.js", "mouse_getkey");

if(BG_HIGH === undefined)
	BG_HIGH = 0x400;

var options=load({}, "modopts.js", ini_section);
if(!options)
	options = {};
if(!options.timelimit)
	options.timelimit = 60;	// minutes
if(!options.timewarn)
	options.timewarn = 5;
if(!options.winners)
	options.winners = 20;
if(!options.selector)
	options.selector = 0;
if(!options.highlight)
	options.highlight = true;
if(!options.boom_delay)
	options.boom_delay = 1000;
if(!options.image_delay)
	options.image_delay = 1500;
if(!options.splash_delay)
	options.splash_delay = 500;
if(!options.sub)
    options.sub = load({}, "syncdata.js").find();
if(js.global.bbs === undefined)
	json_lines = load({}, "json_lines.js");
else {
	var userprops = bbs.mods.userprops;
	if(!userprops)
		userprops = load(bbs.mods.userprops = {}, "userprops.js");
	var json_lines = bbs.mods.json_lines;
	if(!json_lines)
		json_lines = load(bbs.mods.json_lines = {}, "json_lines.js");
	var selector = userprops.get(ini_section, "selector", options.selector);
	var highlight = userprops.get(ini_section, "highlight", options.highlight);
	var difficulty = userprops.get(ini_section, "difficulty", options.difficulty);
	var ansiterm = bbs.mods.ansiterm_lib;
	if(!ansiterm)
		ansiterm = bbs.mods.ansiterm_lib = load({}, "ansiterm_lib.js");
}


// WARNING: The following code is stupid and bad
// Overwriting difficulty to have 2 aspects
difficulty = {
	"size_level": 1,
	"mine_level": 1
}
// STUPID AND BAD CODE OVER


var game = {};
var board = [];
var selected = {x:0, y:0};
var gamewon = false;
var gameover = false;
var new_best = false;
var win_rank = false;
var view_details = false;
var cell_width;	// either 3 or 2
var best = null;

log(LOG_DEBUG, title + " options: " + JSON.stringify(options));

function mouse_enable(enable)
{
	const mouse_passthru = (CON_MOUSE_CLK_PASSTHRU | CON_MOUSE_REL_PASSTHRU);
	if(enable)
		console.status |= mouse_passthru;
	else
		console.status &= ~mouse_passthru;
}

function show_image(filename, fx, delay)
{
	var dir = directory(filename);
	filename = dir[random(dir.length)];
	var Graphic = load({}, "graphic.js");
	var sauce_lib = load({}, "sauce_lib.js");
	var sauce = sauce_lib.read(filename);
	if(delay === undefined)
		delay = options.image_delay;
	if(sauce && sauce.datatype == sauce_lib.defs.datatype.bin) {
		try {
			var graphic = new Graphic(sauce.cols, sauce.rows);
			graphic.load(filename);
			if(fx && graphic.revision >= 1.82)
				graphic.drawfx('center', 'center');
			else
				graphic.draw('center', 'center');
			sleep(delay);
		} catch(e) { 
			log(LOG_DEBUG, e);
		}
	}
}

function countmines(x, y)
{
	var count = 0;
	
	for(var yi = y - 1; yi <= y + 1; yi++)
		for(var xi = x - 1; xi <= x + 1; xi++)
			if((yi != y || xi != x) && mined(xi, yi))
				count++;
	return count;
}

function place_mines()
{
	var mined = new Array(game.height * game.width);
	for(var i = 0; i < game.mines; i++)
		mined[i] = true;

	for(var i = 0; i < game.mines; i++) {
		var r;
		do {
			r = random(game.height * game.width);
		} while (r == (selected.y * game.width) + selected.x);
		var tmp = mined[i];
		mined[i] = mined[r];
		mined[r] = tmp;
	}
	
	for(var y = 0; y < game.height; y++) {
		for(var x = 0; x < game.width; x++) {
			if(mined[(y * game.width) + x])
				board[y][x].mine = true;
		}
	}
	for(var y = 0; y < game.height; y++) {
		for(var x = 0; x < game.width; x++) {
			board[y][x].count = countmines(x, y);
		}
	}
}

function isgamewon()
{
	var covered = 0;
	for(var y = 0; y < game.height; y++) {
		for(var x = 0; x < game.width; x++) {
			if(board[y][x].covered && !board[y][x].mine)
				covered++;
		}
	}
	if(covered === 0) { 
		game.end = Date.now() / 1000;
		if(options.sub) {
			var msgbase = new MsgBase(options.sub);
			var hdr = { 
				to: title,
				from: user.alias,
				subject: winner_subject
			};
			game.name = user.alias;
			game.md5 = md5_calc(JSON.stringify(game));
			game.name = undefined;
			var body = lfexpand(JSON.stringify(game, null, 1));
			body += tear_line;
			if(!msgbase.save_msg(hdr, body))
				alert("Error saving message to: " + options.sub);
			msgbase.close();
			game.md5 = undefined;
		}

		var level = calc_difficulty(game);

		var ceil_level = {};
		ceil_level["size_level"] = Math.ceil(level.size_level);
		ceil_level["mine_level"] = Math.ceil(level.mine_level);


		if(!best) {
			best = {};
		}

		if(!best[level.size_level]) {
			best[level.size_level] = {};
		}
		if(!best[level.size_level][level.mine_level] || calc_time(game) < calc_time(best[level.size_level][level.mine_level])) {
			new_best = true;
			best[level.size_level][level.mine_level] = game;
		}
		
		
		game.name = user.alias;
		var result = json_lines.add(winners_list, game);
		if(result !== true) {
			alert(result);
			console.pause();
		}
		gamewon = true;
		gameover = true;
		draw_board(false);
		show_image(winner_image, true, /* delay: */0);
		var start = Date.now();

		var winners = get_winners(level);

		for(var i = 0; i < options.winners; i++) {
			if(winners[i].name == user.alias && winners[i].end == game.end) {
				win_rank = i + 1;
				break;
			}
		}

		var now = Date.now();
		if(now - start < options.image_delay)
			sleep(options.image_delay - (now - start));
		return true;
	}
	return false;
}

function lostgame(cause)
{
	gameover = true;
	game.end = Date.now() / 1000;
	game.name = user.alias;
	game.cause = cause;
	json_lines.add(losers_list, game);
}
	
function calc_difficulty(game)
{
	var level = {}  // "size_level" and "mine_level" properties, both usually integer
	
	const game_cells = game.height * game.width;	
	const mine_density = game.mines / game_cells;
	level.mine_level = 1 + Math.round((mine_density - min_mine_density) / mine_density_multiplier);  // always int

	const average_dimension = (game.height + game.width) / 2;
	level.size_level = (average_dimension - size_level_multiplier) / size_level_multiplier;  // always float, usually int aligned

	return level;
}

function calc_time(game)
{
	return game.end - game.start;
}

function compare_won_game(g1, g2)
{
	var diff = {
		"size_diff": 0,
		"mine_diff": 0
	};
	diff.size_diff = calc_difficulty(g2).size_level - calc_difficulty(g1).size_level;
	diff.mine_diff = calc_difficulty(g2).mine_level - calc_difficulty(g1).mine_level;

	if (diff.size_diff) {
		return diff.size_diff;
	} else if (diff.mine_diff) {
		return diff.mine_diff;
	} else {
		return calc_time(g1) - calc_time(g2);
	}
}

function secondstr(t, frac)
{
	if(frac)
		return format("%2u:%06.3f", Math.floor(t/60), t%60);
	return format("%2u:%02u", Math.floor(t/60), Math.floor(t%60));
}

function list_contains(list, obj)
{
	var match = false;
	for(var i = 0; i < list.length && !match; i++) {
		match = true;
		for(var p in obj) {
			if(list[i][p] != obj[p]) {
				match = false;
				break;
			}
		}
	}
	return match;
}

// TODO: i do not understand this function. do that
function get_winners(level)
{
	var list = json_lines.get(winners_list);
	if(typeof list != 'object')
		list = [];


	if(options.sub) {
		var msgbase = new MsgBase(options.sub);
		if(msgbase.get_index !== undefined && msgbase.open()) {
			var to_crc = crc16_calc(title.toLowerCase());
			var winner_crc = crc16_calc(winner_subject.toLowerCase());
			var highscores_crc = crc16_calc(highscores_subject.toLowerCase());
			var index = msgbase.get_index();
			for(var i = 0; index && i < index.length; i++) {
				var idx = index[i];
				if((idx.attr&MSG_DELETE) || idx.to != to_crc)
					continue;
				if(idx.subject != winner_crc && idx.subject != highscores_crc)
					continue;
				var hdr = msgbase.get_msg_header(true, idx.offset);
				if(!hdr)
					continue;
				if(!hdr.from_net_type || hdr.to != title)
					continue;
				if(hdr.subject != winner_subject && hdr.subject != highscores_subject)
					continue;
				var body = msgbase.get_msg_body(hdr, false, false, false);
				if(!body)
					continue;
				body = body.split("\n===", 1)[0];
				body = body.split("\n---", 1)[0];
				var obj;
				try {
					obj = JSON.parse(strip_ctrl(body));
				} catch(e) {
					log(LOG_INFO, title + " " + e + ": "  + options.sub + " msg " + hdr.number);
					continue;
				}
				if(!obj.md5)	// Ignore old test messages
					continue;
				if(idx.subject == highscores_crc && !obj.game)
					continue;
				obj.name = hdr.from;
				var md5 = obj.md5;
				obj.md5 = undefined;
				var calced = md5_calc(JSON.stringify(idx.subject == winner_crc ? obj : obj.game));
				if(calced == md5) {
					if(idx.subject == winner_crc) {
						obj.net_addr = hdr.from_net_addr;	// Not included in MD5 sum
						if(!list_contains(list, obj))
							list.push(obj);
					} else {
						for(var j = 0; j < obj.game.length; j++) {
							var game = obj.game[j];
							game.net_addr = hdr.from_net_addr;
							if(!list_contains(list, game))
								list.push(game);
						}
					}
				} else {
					log(LOG_INFO, title +
						" MD5 not " + calced +
						" in: "  + options.sub +
						" msg " + hdr.number);
				}
			}
			msgbase.close();
		}
	}

	
	// filter for level if given
	if(level) {
		list = list.filter(function (obj) {
			var difficulty = calc_difficulty(obj);
			return (difficulty.size_level == Math.round(level.size_level) && difficulty.mine_level == Math.round(level.mine_level));
		});
	}
	
			
	list.sort(compare_won_game)

			
	return list;
}

function show_winners(level)
{
	console.clear();
	console.aborted = false;
	console.attributes = YELLOW|BG_CYAN;
	var str = " " + title + " Top " + options.winners;
	if(level.size_level)
		str += " Level " + level.size_level + "-" + level.mine_level;
	str += " Winners ";
	console_center(str);
	console.attributes = LIGHTGRAY;

	var list = get_winners(level);
	if(!list.length) {
		alert("No " + (level ? ("level " + level.size_level + "-" + level.mine_level + " ") : "") + "winners yet!");
		return;
	}
	console.attributes = WHITE;
	console.print(format("    %-25s%-15s Size-Mine   Time       WxHxMines   Date\r\n", "User", ""));

	var count = 0;
	var displayed = 0;
	var last_level = 0;
	var game = list[0];
	var difficulty = calc_difficulty(game)

	for(var i = 0; i < list.length && displayed < options.winners && !console.aborted; i++) {
		game = list[i];
		difficulty = calc_difficulty(game);
		// TODO: reimplement the code below
		/*
		if(Math.ceil(difficulty) != Math.ceil(last_level)) {
			last_level = difficulty;
			console.pause();
			count = 0;
		} else {
			if(!level && difficulty > 1.0 && count >= options.winners / max_size_level)
				continue;
		}
		*/
		if(displayed&1)
			console.attributes = LIGHTCYAN;
		else
			console.attributes = BG_CYAN;
		console.print(format("%3u %-25.25s%-15.15s %1.2f-%1.2f  %s  %3ux%2ux%-3u   %s\x01>\r\n"
			,count + 1
			,game.name
			,game.net_addr ? ('@'+game.net_addr) : ''
			,difficulty.size_level
			,difficulty.mine_level
			,secondstr(calc_time(game), true)
			,game.width
			,game.height
			,game.mines
			,system.datestr(game.end)
		));
		count++;
		displayed++;
	}
	console.attributes = LIGHTGRAY;
}

function compare_game(g1, g2)
{
	return g2.start - g1.start;
}

function show_log()
{
	console.clear(); 
	console.attributes = YELLOW|BG_CYAN;
	console_center(" " + title + " Log ");
	console.attributes = LIGHTGRAY;
	
	var winners = json_lines.get(winners_list);
	if(typeof winners != 'object')
		winners = [];
	
	var losers = json_lines.get(losers_list);
	if(typeof losers != 'object')
		losers = [];
	
	var list = losers.concat(winners);
	
	if(!list.length) {
		alert("No winners or losers yet!");
		return;
	}
	console.attributes = WHITE;
	console.print(format("Date      %-25s Size-Mine  Time      WxHxMines Rev  Result\r\n", "User", ""));
	
	list.sort(compare_game);
	
	for(var i = 0; i < list.length && !console.aborted; i++) {
		var game = list[i];

		if(i&1)
			console.attributes = LIGHTCYAN;
		else
			console.attributes = BG_CYAN;

		var game_dificulty = calc_difficulty(game)

		console.print(format("%s  %-25s %1.2f-%1.2f %s %3ux%2ux%-3u %3s  %s\x01>\x01n\r\n"
			,system.datestr(game.end)
			,game.name
			,game_dificulty.size_level
			,game_dificulty.mine_level
			,secondstr(calc_time(game), true)
			,game.width
			,game.height
			,game.mines
			,game.rev ? game.rev : ''
			,game.cause ? ("Lost: " + format("%.4s", game.cause)) : "Won"
			));
	}
	console.attributes = LIGHTGRAY;
}

function show_best()
{
	console.clear(LIGHTGRAY);
	console.attributes = YELLOW|BG_CYAN;
	console_center(" Your " + title + " Personal Best Wins ");
	console.attributes = LIGHTGRAY;
	
	var wins = [];
	for(var size in best)
		for (var mine in best[size])
				wins.push(best[size][mine]);
	wins.reverse();	// Display newest first
	
	console.attributes = WHITE;
	console.print("Date       Lvl          Time    WxHxMines  Rev\r\n");
	
	for(var i in wins) {
		var game = wins[i];
		if(i&1)
			console.attributes = LIGHTCYAN;
		else
			console.attributes = BG_CYAN;
		var difficulty = calc_difficulty(game);
		console.print(format("%s  %1.2f-%1.2f  %s  %3ux%2ux%-3u %s\x01>\x01n\r\n"
			,system.datestr(game.end)
			,difficulty.size_level  // TODO: fix, levels update broke it
			,difficulty.mine_level
			,secondstr(calc_time(game), true)
			,game.width, game.height, game.mines
			,game.rev ? game.rev : ''));
	}
}

function cell_val(x, y)
{
	if(gameover && board[y][x].mine && (!view_details || board[y][x].detonated)) {
		if(board[y][x].detonated)
		{
			return '\x01i\x013\x01r' + char_detonated_mine;
		} else if(board[y][x].flagged)
		{
			return '\x012\x01k' + char_flag
		}
		return '\x011\x01k' + char_mine;
	}
	//if(board[y][x].unsure)
	//	return char_unsure;
	if(board[y][x].flagged) {
		if(gameover && !board[y][x].mine)
			return char_badflag;
		return '\x01k\x011' + char_flag;
	}
	if((view_details || !gameover) && board[y][x].covered)
		return char_covered;
	if(board[y][x].count)
		return board[y][x].count;
	return char_empty;
}

function highlighted(x, y)
{
	if(selected.x == x && selected.y == y)
		return true;
	if(!highlight)
		return false;
	return (selected.x == x - 1 || selected.x == x || selected.x == x + 1)
		&& (selected.y == y -1 || selected.y == y || selected.y == y + 1);
}

function draw_cell(x, y)
{
	console.attributes = LIGHTGRAY;
	var val = cell_val(x, y);
	var right = " ";
	var color = "\x01n";
	if (val == char_flag || val == char_badflag) {
		color = "\x011\x01y";
	} else if(val == char_covered) {
		if((x+y)%2) {
			color = "\x014\x01h\x01b";
			val = "\xdb";
			right = "\xdb";
		} else {
			color = "\x014\x01h\x01b";
			val = "\xb2";
			right = "\xb2";
		}
	} else if(val == char_mine) {
		color = "\x011\x01k";
	} else if(val == char_detonated_mine) {
		color = "\x013\x01r";
	} else {
		if((x+y)%2) {
			color = "\x010";
		} else {
			color = "\x010";
		}
		if(val == 1) {
			color += "\x01h\x01c"
		} else if(val == 2) {
			color += "\x01h\x01g"
		} else if(val == 3) {
			color += "\x01h\x01y"
		} else if(val == 4) {
			color += "\x01y"
		} else if(val == 5) {
			color += "\x01h\x01r"
		} else if(val == 6) {
			color += "\x01h\x01r"
		} else if(val == 7) {
			color += "\x01h\x01r"
		} else if(val == 8) {
			color += "\x01h\x01r"
		} else { // for zeros (blank cells)
			color += "\x01w"
		}
	}
	if(game.start && !gameover
		&& !board[selected.y][selected.x].covered
		&& board[selected.y][selected.x].count
		&& highlighted(x, y)) {
		color += "\x01h\x01w";
	}
	if(selected.x == x && selected.y == y && !gameover) {
		right = " ";
		color = "\x017\x01k"
	}
	console.print(color + val + right + "\x01n");
}

// Return total number of surrounding flags
function countflagged(x, y)
{
	var count = 0;
	
	for(var yi = y - 1; yi <= y + 1; yi++)
		for(var xi = x - 1; xi <= x + 1; xi++)
			if((yi != y || xi != x) && flagged(xi, yi))
				count++;
			
	return count;
}

// Return total number of surrounding unflagged-covered cells
function countunflagged(x, y)
{
	var count = 0;
	
	for(var yi = y - 1; yi <= y + 1; yi++)
		for(var xi = x - 1; xi <= x + 1; xi++)
			if((yi != y || xi != x) && unflagged(xi, yi))
				count++;
	
	return count;
}

function totalflags()
{
	if(!game.start)
		return 0;
	var flags = 0;
	for(var y = 0; y < game.height; y++) {
		for(var x = 0; x < game.width; x++) {
			if(board[y][x].flagged)
				flags++;
		}
	}
	return flags;
}

function show_title()
{
	console.attributes = YELLOW|BG_CYAN;
	console_center(title + " " + REVISION);
} 

function draw_border()
{
	const margin = Math.floor((console.screen_columns - (game.width * cell_width)) / 2);
	
	console.creturn();
	console.attributes = LIGHTGRAY;
	console.cleartoeol();
	console.attributes = CYAN;
	console.right(margin - 1);
	console.print('\x016 ');
	if(game.width * cell_width >= console.screen_columns - 3) {
		console.attributes = CYAN;
		console.cleartoeol();
	} else {
		console.right((game.width * cell_width) + !(cell_width&1) - 1);
		console.print('\xDB');
	}
	console.creturn();
	console.attributes = LIGHTGRAY;
}

// A non-destructive console.center() replacement
function console_center(text)
{
	console.right((console.screen_columns - console.strlen(text)) / 2);
	console.print(text);
	console.crlf();
}

// global state variable used by draw_board()
var cmds_shown;
var top;

function draw_board(full)
{
	const margin = Math.floor((console.screen_columns - (game.width * cell_width)) / 2);
	top = Math.floor(Math.max(0, (console.screen_rows - (header_height + game.height)) - 1) / 2);
	console.line_counter = 0;
	console.home();
	if(full) {
		console.down(top);
		console.right(margin - 1);
		console.attributes = BG_CYAN;
		console.print(' ');
		for(var x = 0; x < (game.width * cell_width) + !(cell_width&1) - 1; x++)
		{
			console.print(' ');
		}
		console.print(' ');
		console.creturn();
		show_title();
		draw_border();
	} else
		console.down(top + 1);
	if(gamewon) {
		console.attributes = YELLOW|BLINK;
		var blurb = "Winner! Cleared in";
		if(win_rank)
			blurb = "Rank " + win_rank + " Winner in";
		else if(new_best)
			blurb = "Personal Best Time";
		console_center(blurb + " " + secondstr(calc_time(game), true).trim());
		console_center("");
	} else if(gameover && !view_details) {
		console.attributes = CYAN|HIGH|BLINK;
		console_center((calc_time(game) < options.timelimit * 60
			? "" : "Time-out: ") + "Game Over");
	} else {
		var elapsed = 0;
		if(game.start) {
			if(gameover)
				elapsed = game.end - game.start;
			else
				elapsed = (Date.now() / 1000) - game.start;
		}
		var timeleft = Math.max(0, (options.timelimit * 60) - elapsed);
		console.attributes = LIGHTCYAN;
		console_center(format("%2d Mines  %s%s ",
			game.mines - totalflags(),
			game.start && !gameover && (timeleft / 60) <= options.timewarn ? "\x01r\x01h\x01i" : "",
			secondstr(elapsed)
			));
		
		draw_border();
		console_center(format("Lvl %1.2f-%1.2f",
			calc_difficulty(game).size_level,
			calc_difficulty(game).mine_level
		))
	}
	var cmds = "";
	if(full || cmds !== cmds_shown) {
		console.clear_hotspots();
		draw_border();
		
		cmds += "[\x01h?\x01n]Help";
		if (!gameover && !game.start)
		{
			cmds += "  [\x01hE\x01n]\x01y\x02\x01n  [\x01hQ\x01n]\x01rQuit\x01n";
		} else if (!gameover && game.start) {
			cmds += "  [\x01hD\x01n]Dig  [\x01hF\x01n]Flag";
		} else {
			cmds = "[\x01hR\x01n]Retry  [\x01hN\x01n]New  [\x01hD\x01n]Show";
		}
		
		cmds_shown = cmds;
		
		
		console_center(cmds);
		
	} else if(!console.term_supports(USER_ANSI)) {
		console.creturn();
		console.down(2);
	}
	var redraw_selection = false;
	for(var y = 0; y < game.height; y++) {
		if(full)
			draw_border();
		for(var x = 0; x < game.width; x++) {
			if(full || board[y][x].changed !== false) {
				if(console.term_supports(USER_ANSI))
					console.gotoxy((x * cell_width) + margin + 1, header_height + y + top + 1);
				else {
					console.creturn();
					console.right((x * cell_width) +  margin);
				}
				draw_cell(x, y);
				if(cell_width < 3)
					redraw_selection = true;
			}
			board[y][x].changed = false;
		}
		if(y + 1 < game.height && (full || !console.term_supports(USER_ANSI)))
			console.down();
		console.line_counter = 0;
	}
	var height = game.height;
	if(full) {
		if(game.height + header_height < console.screen_rows) {
			height++;
			console.down();
			console.creturn();
			console.right(margin - 1);
			console.attributes = CYAN;
			console.print('\xDF');
			for(var x = 0; x < (game.width * cell_width) + !(cell_width&1) - 1; x++)
			{
				console.print('\xDF');
			}
			console.print('\xDF');
		}
		console.attributes = LIGHTGRAY;
	}
	if(redraw_selection) { // We need to draw/redraw the selected cell last in this case
		if(console.term_supports(USER_ANSI))
			console.gotoxy(margin + (selected.x * cell_width) + 1, header_height + selected.y + top + 1);
		else {
			console.up(height - (selected.y + 1));
			console.creturn();
			console.right(margin + (selected.x * cell_width));
		}
		draw_cell(selected.x, selected.y);
		console.left(2);
	}
	console.gotoxy(margin + (selected.x * cell_width) + 2, header_height + selected.y + top + 1);
}

function mined(x, y)
{
	return board[y] && board[y][x] && board[y][x].mine;
}

function start_game()
{
	place_mines();
	game.start = Date.now() / 1000;
}

function uncover_cell(x, y)
{
	if(!board[y] || !board[y][x])
		return false;
	if(board[y][x].flagged)
		return false;

	board[y][x].covered = false;
	//board[y][x].unsure = false;
	board[y][x].changed = true;
	
	if(!mined(x, y))
		return false;
	board[y][x].detonated = true;
	return true;
}

function flagged(x, y)
{
	return board[y] && board[y][x] && board[y][x].flagged;
}

function unflagged(x, y)
{
	return board[y] && board[y][x] && board[y][x].covered && !board[y][x].flagged;
}

// Returns true if mined (game over)
function uncover(x, y)
{
	if(!game.start)
		start_game();
	
	if(!board[y] || !board[y][x] || board[y][x].flagged || !board[y][x].covered)
		return;
	if(uncover_cell(x, y))
		return true;
	if(board[y][x].count)
		return false;
	for(var yi = y - 1; yi <= y + 1; yi++)
		for(var xi = x - 1; xi <= x + 1; xi++)
			if((yi != y || xi != x) && !mined(xi, yi))
				uncover(xi, yi);
	return false;
}

function distance(x1, y1, x2, y2)
{
	var dx = x2-x1;
	var dy = y2-y1;
	
	return Math.sqrt(dx*dx + dy*dy);
}

// used to begin a game from an empty cell. equivalent to the minesweeper smley face.
function easy_open()
{
	if(!game.start)
	{
		start_game();
		
		// lowest_distance set to impossibly high value so any empty cell will override it
		var lowest_distance = game.height + game.width;
		var current_distance = game.height + game.width;
		
		var center_x = Math.floor(game.width / 2) - !(game.width&1);
		var center_y = Math.floor(game.height / 2) - !(game.height&1);
		
		var best_cell = { x: center_x, y: center_y }
		
		for (var y=0; y<game.height; y++)
		{
			for (var x=0; x<game.width; x++)
			{
				current_distance = distance(x, y, center_x, center_y);
				
				if (!board[y][x].mine && !board[y][x].count && current_distance<lowest_distance)
				{
					lowest_distance = current_distance;
					best_cell.x = x;
					best_cell.y = y;
				}
			}
		}
		
		if (uncover(best_cell.x, best_cell.y))
		{
			return true;
		}
		return false;
	}
	return false;
}

function can_chord(x, y)
{
	return !board[y][x].covered 
		&& board[y][x].count
		&& board[y][x].count == countflagged(x, y)
		&& countunflagged(x, y);
}

// Return true if mine denotated
function chord(x, y)
{
	for(var yi = y - 1; yi <= y + 1; yi++)
		for(var xi = x - 1; xi <= x + 1; xi++)
			if((yi != y || xi != x) && uncover(xi, yi))
				return true;
	return false;
}

// function to ask user for difficulty
// returns an integer
// 'all' is for if the user is asking for leaderboards, so that they can show all levels
// returned level of 0 used to show all levels in leaderboards
function get_difficulty(all)
{
	// setting result to impossible values
	var result = {
		"size_level": -2,
		"mine_level": -2
	};

	console.creturn();
	console.cleartoeol();
	draw_border();
	console.attributes = WHITE;
	console.clear_hotspots();
	mouse_enable(false);
	var size_lvls = "";
	for(var i = 1; i <= max_size_level; i++)
		size_lvls += "\x01~" + i;
	var mine_lvls = "";
	for(var i = 1; i <= max_mine_level; i++)
		mine_lvls += "\x01~" + i;


	// when asking for leaderboards
	if(all) {
		// ask user for size level
		console.right((console.screen_columns - 20) / 2);
		console.print(format("Size Level (%s) [\x01~All]: ", size_lvls));
		var key = console.getkeys("QA", max_size_level);
		if(key == 'A') {
			result.size_level = 0;
		}
		else if(key == 'Q') {  // let user quit out of level selector
			result.size_level = -1;
			return result;
		}
		result.size_level = key;

		// ask user for mine level
		console.right((console.screen_columns - 20) / 2);
		console.print(format("Mine Level (%s) [\x01~All]: ", mine_lvls));
		key = console.getkeys("QA", max_mine_level);
		if(key == 'A') {
			result.mine_level = 0;
		}
		else if(key == 'Q') {  // let user quit out of level selector
			result.size_level = -1;
			return result;
		}
		result.mine_level = key;

		return result;
	}

	console.right((console.screen_columns - 24) / 2);
	console.print(format("Size Level (%s): ", size_lvls));
	// result.size_level = console.getnum(max_size_level);
	key = console.getkeys("Q", max_size_level);
	if(key == 'Q') {  // let user quit out of level selector
		result.size_level = -1;
		return result;
	}
	result.size_level = key;
	
	console.right((console.screen_columns - 24) / 2);
	console.print(format("Mine Level (%s): ", mine_lvls));
	// result.mine_level = console.getnum(max_mine_level);
	key = console.getkeys("Q", max_mine_level);
	if(key == 'Q') {  // let user quit out of level selector
		result.size_level = -1;
		return result;
	}
	result.mine_level = key;
	
	return result;
}

function target_height(difficulty)
{
	return size_level_multiplier + (difficulty * size_level_multiplier);
}

function select_middle()
{
	selected.x = Math.floor(game.width / 2) - !(game.width&1);
	selected.y = Math.floor(game.height / 2) - !(game.height&1);
}

function init_game(difficulty)
{
	console.line_counter = 0;
	console.clear(LIGHTGRAY);

	gamewon = false;
	gameover = false;
	new_best = false;
	win_rank = false;
	view_details = false;
	game = { rev: REVISION };
	game.height = target_height(difficulty.size_level);
	game.width = game.height;
	game.height = Math.min(game.height, console.screen_rows - header_height);
	game.width += game.width - game.height;
	cell_width = 2;  // TODO: this line seems too hard-coded. Maybe reference a const or something
	game.width = Math.min(game.width, Math.floor((console.screen_columns - 5) / cell_width));
	game.mines = Math.floor((game.height * game.width) 
		* (min_mine_density + ((difficulty.mine_level - 1) * mine_density_multiplier)));
	log(LOG_INFO, title + " new level " + difficulty.size_level + "-" + difficulty.mine_level + " board WxHxM: " 
		+ format("%u x %u x %u", game.width, game.height, game.mines));
	game.start = 0;
	// init board:
	board = [];
	for(var y = 0; y < game.height; y++) {
		board[y] = new Array(game.width);
		for(var x = 0; x < game.width; x++) {
			board[y][x] = { covered: true };
		}
	}
	select_middle();
	return difficulty;
}

function change(x, y)
{
	if(y) {
		if(x)
			board[y - 1][x - 1].changed = true;
		board[y - 1][x].changed = true;
		if(board[y - 1][x + 1])
			board[y - 1][x + 1].changed = true;
	}
	if(x)
		board[y][x - 1].changed = true;
	board[y][x].changed = true;
	if(board[y][x + 1])
		board[y][x + 1].changed = true;
	if(board[y + 1]) {
		if(x)
			board[y + 1][x - 1].changed = true;
		board[y + 1][x].changed = true;
		if(board[y + 1][x + 1])
			board[y + 1][x + 1].changed = true;
	}
}

function screen_to_board(mouse)
{
	const margin = Math.floor((console.screen_columns - (game.width * cell_width)) / 2);
	top = Math.floor(Math.max(0, (console.screen_rows - (header_height + game.height)) - 1) / 2);

	var x = (mouse.x - margin + (cell_width - 2)) / cell_width;
	if (Math.floor(x) !== x)
		return false;
	mouse.x = x;
	mouse.y = (mouse.y - top - header_height);
	if (mouse.x < 1 || mouse.y < 1 ||
	    mouse.x > game.width || mouse.y > game.height)
		return false;
	return true;
}

function play()
{
	console.clear();
	var start = Date.now();
	show_image(welcome_image, /* fx: */false, /* delay: */0);

	// Find "personal best" wins
	var winners = json_lines.get(winners_list);
	for(var i in winners) {
		var win = winners[i];
		// console.print(" :thing: " + JSON.stringify(winners) + " :endthing: ");
		if(win.name !== user.alias)
			continue;
		var level = calc_difficulty(win);
		
		// add new entries to `best`
		if(!best)
			best = {};
		if(!best[level.size_level]) {
			best[level.size_level] = {};
		}

		// TODO: skip statement below might be redundant
		// skip if not new best
		if(best[level.size_level][level.mine_level] && calc_time(best[level.size_level][level.mine_level]) < calc_time(win))
			continue;
		// add if new best
		if(!best[level.size_level][level.mine_level] || calc_time(win) < calc_time(best[level.size_level][level.mine_level])) {
			best[level.size_level][level.mine_level] = win;
		}
	}
	var now = Date.now();
	if(now - start < options.splash_delay)
		sleep(options.splash_delay - (now - start));

	// game startup
	show_image(mine_image, true);
	sleep(options.splash_delay);
	init_game(difficulty);
	draw_board(true);
	var full_redraw = false;

	// main loop
	while(bbs.online) {
		if(!gameover && game.start
			&& Date.now() - (game.start * 1000) >= options.timelimit * 60 * 1000) {
			lostgame("timeout");
			draw_board(true);
		}
		var mk = mouse_getkey(K_NONE, 1000, true);
		var key = mk.key;
		if (mk.mouse !== null) {
			if ((!mk.mouse.release) || mk.mouse.motion || !screen_to_board(mk.mouse)) {
				key = null;
			}
			else {
				switch(mk.mouse.button) {
					case 0:
						key = 'D';
						break;
					case 1:
						key = 'C';
						break;
					case 2:
						key = 'F';
						break;
					default:
						key = null;
				}
			}
		}
		if(key === '' || key === null) {
			if(game.start && !gameover)
				draw_board(false);	// update the time display
			continue;
		}
		change(selected.x, selected.y);
		if (mk.mouse !== null) {
			selected.x = mk.mouse.x - 1;
			selected.y = mk.mouse.y - 1;
		}
		switch(key.toUpperCase()) {
			case KEY_HOME:
				if(!gameover)
					selected.x = 0;
				break;
			case KEY_END:
				if(!gameover)
					selected.x = game.width - 1;
				break;
			case KEY_PAGEUP:
				if(!gameover)
					selected.y = 0;
				break;
			case KEY_PAGEDN:
				if(!gameover)
					selected.y = game.height -1;
				break;
			case '7':
				if(!gameover && selected.y && selected.x) {
					selected.y--;
					selected.x--;
				}
				break;
			case '8':
			case KEY_UP:
				if(!gameover && selected.y)
					selected.y--;
				break;
			case '9':
				if(!gameover && selected.y && selected.x < game.width - 1) {
					selected.y--;
					selected.x++;
				}
				break;
			case '2':
			case KEY_DOWN:
				if(!gameover && selected.y < game.height - 1)
					selected.y++;
				break;
			case '1':
				if(!gameover && selected.y < game.height -1 && selected.x) {
					selected.y++;
					selected.x--;
				}
				break;
			case '3':
				if(!gameover && selected.x < game.width - 1&& selected.y < game.height - 1) {
					selected.x++;
					selected.y++;
				}
				break;
			case '4':
			case KEY_LEFT:
				if(!gameover && selected.x)
					selected.x--;
				break;
			case '5':
				if(!gameover)
					select_middle();
				break;
			case '6':
			case KEY_RIGHT:
				if(!gameover && selected.x < game.width - 1)
					selected.x++;
				break;
			case 'D':	// Dig (or Details)
			case ' ':
				if(gameover) {
					if(!gamewon) {
						view_details = !view_details;
						full_redraw = true;
					}
				} else if(!gameover && can_chord(selected.x, selected.y)) {
					if(chord(selected.x, selected.y))
						lostgame("mine");
					else 
						isgamewon();
					full_redraw = gameover;
				} else if(board[selected.y][selected.x].covered && !board[selected.y][selected.x].flagged){
					if(uncover(selected.x, selected.y))
						lostgame("mine");
					else
						isgamewon();
					full_redraw = gameover;
				}
				break;
			case 'C':	// Chord
				if(!gameover && can_chord(selected.x, selected.y)) {
					if(chord(selected.x, selected.y))
						lostgame("mine");
					else 
						isgamewon();
					full_redraw = gameover;
				}
				break;
			case 'F':	// Flag
				if(!gameover && board[selected.y][selected.x].covered) {
					if(board[selected.y][selected.x].flagged) {
						board[selected.y][selected.x].flagged = false;
					} else {
						board[selected.y][selected.x].flagged = true;
					}
					if(!game.start)
						start_game();
					full_redraw = gameover;
				}
				break;
			case 'R':
			{
				full_redraw = false;
				console.home();
				console.down(top + 1);
				if(game.start && !gameover) {
					console.cleartoeol();
					draw_border();
					console.attributes = LIGHTCYAN;
					console.right((console.screen_columns - 15) / 2);
					mouse_enable(false);
					console.clear_hotspots();
					console.print("New Game (\x01~Y/\x01~N) ?");
					var key = console.getkey(K_UPPER);
					if(key != 'Y')
						break;
				}
				init_game(difficulty);
				break;
			}
			case 'N':
			{
				full_redraw = false;
				console.home();
				console.down(top + 1);
				if(game.start && !gameover) {
					console.cleartoeol();
					draw_border();
					console.attributes = LIGHTCYAN;
					console.right((console.screen_columns - 15) / 2);
					mouse_enable(false);
					console.clear_hotspots();
					console.print("New Game (\x01~Y/\x01~N) ?");
					var key = console.getkey(K_UPPER);
					if(key != 'Y')
						break;
				}
				var new_difficulty = get_difficulty();
				if(new_difficulty.size_level > 0)
					full_redraw = true;
					difficulty = init_game(new_difficulty);
				break;
			}
			case 'E':
			{
				if(!gameover && !game.start)
				{
					easy_open();
				}
				break;
			}
			case 'W':
			{
				if(!gameover && board[selected.y][selected.x].covered) {
					if(board[selected.y][selected.x].flagged) {
						board[selected.y][selected.x].flagged = false;
					} else {
						board[selected.y][selected.x].flagged = true;
					}
					if(!game.start)
						start_game();
					full_redraw = gameover;
				}
				break;
			}
			case 'L':
			{
				full_redraw = false;
				mouse_enable(false);
				console.home();
				console.down(top + 1);
				var level = get_difficulty(true);
				if(level.size_level >= 0) {
					full_redraw = true;
					console.line_counter = 0;
					show_winners(level);
					console.pause();
					console.clear();
					console.aborted = false;
				}
				break;
			}
			case 'T':
				mouse_enable(false);
				show_winners();
				console.pause();
				console.clear();
				console.aborted = false;
				full_redraw = true;
				break;
			case 'H':
				mouse_enable(false);
				console.line_counter = 0;
				show_log();
				console.pause();
				console.clear();
				console.aborted = false;
				full_redraw = true;
				break
			case 'B':
				if(!best)
					break;
				console.line_counter = 0;
				mouse_enable(false);
				show_best();
				console.pause();
				console.clear();
				console.aborted = false;
				full_redraw = true;
				break;
			case '?':
				mouse_enable(false);
				console.line_counter = 0;
				console.clear();
				console.printfile(help_file);
				console.pause();
				console.clear();
				console.aborted = false;
				full_redraw = true;
				break;
			case '\t':
				highlight = !highlight;
				break;
			case CTRL_R:
				console.clear();
				full_redraw = true;
				break;
			case CTRL_S:
				selector++;
				break;
			case 'Q':
				if(game.start && !gameover) {
					full_redraw = false;
					console.home();
					console.down(top + 1);
					console.cleartoeol();
					draw_border();
					console.attributes = LIGHTCYAN;
					console.right((console.screen_columns - 16) / 2);
					mouse_enable(false);
					console.clear_hotspots();
					console.print("Quit Game (\x01~Y/\x01~N) ?");
					var key = console.getkey(K_UPPER);
					
					if(key != 'Y')
						break;
				}
				return;
		}
		change(selected.x, selected.y);
		draw_board(full_redraw);
		full_redraw = false;
	}
}

try {

	// Parse cmd-line options here:
	var numval;
	for(var i = 0; i < argv.length; i++) {
		numval = parseInt(argv[i]);
		if(!isNaN(numval))
			break;
	}

	if(js.global.console) {
		if(argv.indexOf("nocls") < 0)
			js.on_exit("console.clear()");

		js.on_exit("console.attributes = LIGHTGRAY");
	}
	if(argv.indexOf("winners") >= 0) {
		if(!isNaN(numval) && numval > 0)
			options.winners = numval;
		show_winners();
		exit();
	}

	if(argv.indexOf("export") >= 0) {
		if(!options.sub) {
			alert("Sub-board not defined");
			exit(1);
		}
		var count = 20;
		if(!isNaN(numval) && numval > 0)
			count = numval;
		var list = json_lines.get(winners_list);
		if(typeof list != 'object') {
			alert("No winners yet: " + list);
			exit(0);
		}
		list.sort(compare_won_game);
		var obj = { date: Date(), game: [] };
		for(var i = 0; i < list.length && i < count; i++)
			obj.game.push(list[i]);
		obj.md5 = md5_calc(JSON.stringify(obj.game));
		var msgbase = new MsgBase(options.sub);
		var hdr = {
			to: title,
			from: system.operator,
			subject: highscores_subject
		};
		var body = lfexpand(JSON.stringify(obj, null, 1));
		body += tear_line;
		if(!msgbase.save_msg(hdr, body)) {
			alert("Error saving message to: " + options.sub);
			exit(2);
		}
		msgbase.close();
		exit(0);
	}

	if(js.global.console) {
		js.on_exit("console.line_counter = 0");
		js.on_exit("console.status = " + console.status);
		js.on_exit("console.ctrlkey_passthru = " + console.ctrlkey_passthru);
		console.ctrlkey_passthru = "KOPTUZ";
	}
	if(!isNaN(numval) && numval > 0 && numval < max_size_level)
		difficulty = numval;

	if(!difficulty)
		difficulty = 1;
	
	play();
	userprops.set(ini_section, "selector", selector%selectors.length);
	userprops.set(ini_section, "highlight", highlight);
	userprops.set(ini_section, "difficulty", difficulty);
	
} catch(e) {
	
	var msg = file_getname(e.fileName) + 
		" line " + e.lineNumber + 
		": " + e.message;
	if(js.global.console)
		console.crlf();
	alert(msg);
	if(options.sub && user.alias != author) {
		var msgbase = new MsgBase(options.sub);
		var hdr = { 
			to: author,
			from: user.alias || system.operator,
			subject: title
		};
		msg += tear_line;
		if(!msgbase.save_msg(hdr, msg))
			alert("Error saving exception-message to: " + options.sub);
		msgbase.close();
	}
}
