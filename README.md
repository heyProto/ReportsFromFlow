# Flow API Integrations

Command line utility tool. Generates markdown console output for SOD, EOD and weekly standups, that can be directly ingested into Slack's message builder. Built using [Node.js](https://nodejs.org/) v8.11.3

Currently only supports SOD reports.

Markdown output integration with Slack App example:
![Slack App Example](resources/SlackApp.png "Slack App Example")

### Installation

```sh
$ npm install
```

### Usage

```sh
$  node index.js --help
  Usage: index.js [options] [command]

  Commands:
    help     Display help
    version  Display version

  Options:
    -h, --help     Output usage information
    -t, --token    Access token to be used for pulling data
    -v, --version  Output the version number
```

###### Example

```sh
$ node index.js -t <flow_access_token>
```

### TODO

1. Correct implementation of "flagged" to only show tasks that the owner has flagged
2. Support EOD and weekly standups
3. Integrate with Slack Apps
