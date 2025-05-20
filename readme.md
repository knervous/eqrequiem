# EQ: Requiem

EQ: Requiem is a project that brings EverQuest to the browser using the BabylonJS Engine and go. Contributors are welcome, please reach out in discord:

Discord: https://discord.gg/ptJxyejwXt


# Local Development and Contributing

EQ Requiem will always remain open source and welcomes contributions of all kinds. Here are steps to get local development set up:

## Requirements

- Go version 1.24 https://go.dev/doc/install
- MySQL
  - Windows: https://dev.mysql.com/doc/mysql-installation-excerpt/5.7/en/windows-installation.html
  - Linux: https://dev.mysql.com/doc/mysql-installation-excerpt/5.7/en/linux-installation.html
  - Mac: https://dev.mysql.com/doc/mysql-installation-excerpt/5.7/en/macos-installation.html
- NodeJS + npm https://nodejs.org/en/download
- Local port 443 available (This could be worked around but we're not there yet)

## Nice to have

- VSCode https://code.visualstudio.com/download
- Make (Windows users can just use CLI commands instead but Make makes things easy)

# Setting up Local Development

## Client

- From the root directory, run `cd client && npm install`
- Run the client development server with different options
  - `npm run start:prod` - This allows you to do client-side code changes without a server spun up and depends on the live server to be up
  - `npm start` - This will try to connect to your locally running go backend on port 443
  - `npm run sage:dev` - This is for using Sage to convert assets in runtime and requires installing the Sage core module as a sibling repo of this repo https://github.com/knervous/eqsage

## Server

In order to start the server, you must first install MySQL and seed the database from the latest template db `eqgo`

### MySQL

- Download the dump file: https://eqrequiem.blob.core.windows.net/dev/eqgo.sql.zip
- Extract it anywhere
- CD to the directory the `dumpfile.sql` lives in and run 
  - `mysql -u [username] -p[password] -e "CREATE DATABASE IF NOT EXISTS eqgo"`
  - `mysql -u[username] -p[password] eqgo < dumpfile.sql`
- Verify the database is populated and running
  

### Config
- Under the directory `server/internal/config` there's a template called `eqgo_config_template.json`, copy that and rename it `eqgo_config.json`
- Fill out all the necessary credentials to connect to your MySQL DB

### Ready to launch
- For the rest of the commands you should be cd into `server` in the root directory
- If you have Make, you can run `make s` to run the server, see the Makefile for the rest of the commands
- If you *don't* have Make (on Windows) then you can run `go run ./cmd/server` to start the server
- If you want to debug in VSCode, there are launch options to start normally and with local quests. Local quests allow you to hot swap quests out every time you save.

You are now ready to connect and should be able to visit the local webpack development server and connect to your local backend

https://eqrequiem.blob.core.windows.net/dev/eqgo.sql.zip