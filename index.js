const axios = require("axios");
const xlsx = require("xlsx");
const args = require("args");
const moment = require("moment");

args.option("token", "Access token to be used for pulling data");
// args.option("report", "Type of report to generate (sod,eod or weekly)");
const flags = args.parse(process.argv);

if (
  !flags.token //||
  //   !flags.report ||
  //   !["sod", "eod", "weekly"].find(x => x === flags.report)
) {
  console.error("Invalid usage");
  args.showHelp();
  process.exit(1);
}

// const report = flags.report.toLowerCase();
// console.log("Generationg", report.toUpperCase(), "report...");

let apiCallCount = 0;

const orgId = 408601;
let userMap = new Map();
let sectionMap = new Map();
let projectMap = new Map();

const accessToken = flags.token;

let axiosInstance = axios.create({
  baseURL: "https://api.getflow.com/v2/",
  headers: {
    Authorization: "Bearer " + accessToken,
    "Content-Type": "application/vnd.flow.v2+json",
    Accept: "application/vnd.flow.v2+json",
  },
  timeout: 300000,
});

axiosInstance.interceptors.request.use(request => {
  console.log('Starting request to URL: "', request.url, '"');
  apiCallCount++;
  return request;
});

axios
  .all([
    fetchTeamsAndAccounts(
      "workspaces?include=accounts&organization_id=" + orgId
    ),
    fetchTasks("tasks?completed=false&deleted=false&organization_id=" + orgId),
  ])
  .then(
    axios.spread((x, y) => {
      x.accounts = x.accounts.filter(account => !account.demo);
      x.accounts.forEach(account => {
        userMap.set(account.id, account.name);
      });

      let sections = [];
      x.workspaces.forEach(team => {
        sections.push(
          fetchSections(
            "lists?include=sections&workspace_id=" +
              team.id +
              "&organization_id=" +
              orgId
          )
        );
      });

      Promise.all(sections).then(res => {
        x.accounts.forEach(account => {
          retrieveSODData(y, account.id);
        });
      });

      let activities = [];
      let today = new Date();
      today.setDate(today.getDate());
      let yesterday = new Date();
      yesterday.setDate(today.getDate() - 1);
      const yesterdayEnd = new Date(today.setUTCHours(0, 0, 0, 0));
      const yesterdayStart = new Date(yesterday.setUTCHours(0, 0, 0, 0));
      //   x.accounts.forEach(account => {
      //     activities.push(
      //       fetchActivities(
      //         "activities?order=created_at&include=tasks" +
      //           "&task_owner_id=" +
      //           account.id +
      //           "&before=" +
      //           yesterdayEnd.toISOString() +
      //           "&after=" +
      //           yesterdayStart.toISOString() +
      //           "&organization_id=" +
      //           orgId,
      //         account
      //       )
      //     );
      //   });

      //   axios.all(activities).then(member => {
      //     let worksheets = [];
      //     member.forEach(i => {
      //       let memberTasks = y.filter(task => task.owner_id === i.owner.id);

      //       let memberActivities = i.activities.map(activity => {
      //         let currentTask = i.tasks.find(
      //           task => task.id === activity.target_id
      //         );
      //         return {
      //           project_id: currentTask.list_id,
      //           parent_id: currentTask.parent_id,
      //           id: currentTask.id,
      //           task_name: currentTask.name,
      //           due_on: currentTask.due_on,
      //           completed: currentTask.completed,
      //           action: translateAction(activity.action),
      //           payload: parseActivityPayload(activity.action, activity.payload),
      //           updated_at: activity.updated_at,
      //         };
      //       });

      //       memberActivities.sort((a, b) => {
      //         if (a.project_id < b.project_id) {
      //           return -1;
      //         } else if (a.project_id > b.project_id) {
      //           return 1;
      //         } else {
      //           if (a.parent_id < b.parent_id) {
      //             return -1;
      //           } else if (a.parent_id > b.parent_id) {
      //             return 1;
      //           } else {
      //             if (a.id < b.id) {
      //               return -1;
      //             } else if (a.id > b.id) {
      //               return 1;
      //             } else {
      //               if (a.updated_at < b.updated_at) {
      //                 return -1;
      //               } else if (a.updated_at > b.updated_at) {
      //                 return 1;
      //               } else return 0;
      //             }
      //           }
      //         }
      //       });

      //       let ws = xlsx.utils.json_to_sheet(memberActivities);
      //       xlsx.utils.sheet_add_json(ws, memberTasks, {
      //         origin: memberActivities.length + 5,
      //       });

      //       worksheets.push({ name: i.owner.name, data: ws });
      //       //   console.log(i.owner.name, i.activities, i.tasks);
      //     });

      //     let wb = xlsx.utils.book_new();
      //     worksheets.forEach(worksheet => {
      //       xlsx.utils.book_append_sheet(wb, worksheet.data, worksheet.name);
      //     });

      //     xlsx.writeFile(wb, "EOD Standup.xlsx");
      //   });

      //   console.log(x.accounts);
      //   let tasks = arrangeTasksForProjects(y);
      //   let parents = tasks.values();
      //   let current = parents.next();
      //   while (!current.done) {
      //     current.value.forEach(element => {
      //       if (element.subtasks.length > 0) console.log(element.subtasks.length);
      //       else console.log("No subtasks");
      //     });

      //     current = parents.next();
      //   }
    })
  )
  .catch(err => {
    console.log(err);
  });

async function fetchSections(uri_string) {
  try {
    let res = await axiosInstance.get(uri_string);
    let nextLink = getNextURI(res.headers.link);
    let sections = res.data.sections;
    let lists = res.data.lists;
    if (sections) {
      sections.forEach(section => {
        sectionMap.set(section.id, section.name);
      });
    }
    lists.forEach(list => {
      projectMap.set(list.id, list.name);
    });
    if (nextLink) {
      await fetchSections(nextLink);
    } else {
    }
  } catch (err) {
    console.error("Unable to retrieve list of sections and projects.");
    console.error(err);
    return [];
  }
}

async function fetchTeamsAndAccounts(uri_string) {
  try {
    let res = await axiosInstance.get(uri_string);
    let nextLink = getNextURI(res.headers.link);
    let workspaces = res.data.workspaces;
    workspaces = workspaces.map(x => {
      return {
        id: x.id,
        name: x.name,
      };
    });
    let accounts = res.data.accounts;
    accounts = accounts.map(x => {
      return {
        id: x.id,
        name: x.name,
        email: x.email,
        joined: x.joined,
        demo: x.demo,
      };
    });

    if (nextLink) {
      let nextCall = await fetchTeamsAndAccounts(nextLink);
      return {
        workspaces: workspaces.concat(nextCall.workspaces),
        accounts: accounts.concat(nextCall.accounts),
      };
    } else {
      return { workspaces: workspaces, accounts: accounts };
    }
  } catch (err) {
    console.error(
      "Unable to retrieve list of workspaces and/or accounts either."
    );
    console.error(err);
    return { workspaces: [], accounts: [] };
  }
}

async function fetchTasks(uri_string) {
  try {
    let res = await axiosInstance.get(uri_string);
    let nextLink = getNextURI(res.headers.link);
    let tasks = res.data.tasks;
    if (nextLink) {
      return tasks.concat(await fetchTasks(nextLink));
    } else {
      return tasks;
    }
  } catch (err) {
    console.error("Unable to retrieve list of available tasks.");
    console.error(err);
    return [];
  }
}

async function fetchActivities(uri_string, owner) {
  try {
    let res = await axiosInstance.get(uri_string);
    console.log(res.headers.link);
    let nextLink = getNextURI(res.headers.link);
    let activities = res.data.activities;
    let tasks = res.data.tasks;
    if (nextLink) {
      let nextCall = await fetchActivities(nextLink);
      return {
        activities: activities.concat(nextCall.activities),
        tasks: tasks.concat(nextCall.tasks),
      };
    } else {
      return { owner: owner, activities: activities, tasks: tasks };
    }
  } catch (err) {
    console.error("Unable to retrieve list of available activities.");
    console.error(err);
    return { owner_id: owner_id, activities: [], tasks: [] };
  }
}

function arrangeTasksForProjects(tasks) {
  let parentTasks = new Map();
  let parents = new Set();
  let projectTasks = new Map();

  tasks.forEach(element => {
    if (element.parent_id == null) {
      parents.add(element);
    } else {
      if (parentTasks.has(element.parent_id)) {
        let tasks = parentTasks.get(element.parent_id).concat(element);
        parentTasks.set(element.parent_id, tasks);
      } else {
        let tasks = [];
        parentTasks.set(element.parent_id, tasks.concat(element));
      }
    }
  });

  //   console.log(parentTasks);
  parents.forEach(x => {
    let subtasks = parentTasks.get(x.id);
    parentTasks.delete(x.id);
    x.subtasks = subtasks ? subtasks : [];
    if (projectTasks.has(x.list_id)) {
      projectTasks.get(x.list_id).push(x);
    } else {
      projectTasks.set(x.list_id, [x]);
    }
  });
  let orphans = parentTasks.entries();
  let currentOrphan = orphans.next();
  while (!currentOrphan.done) {
    if (projectTasks.has(currentOrphan.value[0].list_id)) {
      projectTasks.get(currentOrphan.value[0].list_id).push({
        id: currentOrphan.key,
        subtasks: currentOrphan.value,
        orphan: true,
      });
    } else {
      projectTasks.set(currentOrphan.value[0].list_id, [
        {
          id: currentOrphan.key,
          subtasks: currentOrphan.value,
          orphan: true,
        },
      ]);
    }
  }

  //   console.log(projectTasks);
  return projectTasks;
}

function getNextURI(current_uri) {
  let nextLink = current_uri.split(",").find(x => {
    return x.match(/<.*>; rel="next"/g);
  });

  if (nextLink) {
    nextLink = nextLink.substring(
      nextLink.indexOf("<") + 28,
      nextLink.indexOf(">")
    );
  }

  return nextLink;
}

function parseActivityPayload(action, payload) {
  switch (action) {
    case "delete":
      return "";
    case "set_owner":
      return userMap.get(payload.owner_id);
    case "change_timeline":
      return (
        "[" +
        payload.starts_on_was +
        " - " +
        payload.due_on_was +
        "] => [" +
        payload.starts_on +
        " - " +
        payload.due_on +
        "]"
      );
    case "set_starts_on":
      return payload.starts_on;
    case "set_due":
      return payload.due_on;
    case "set_list":
      return payload.list_name;
    case "set_section":
      return payload.section_name;
    case "change_section":
      return payload.section_name_was + " => " + payload.section_name;
    default:
      return "Unknown action";
  }
}

function translateAction(action) {
  switch (action) {
    case "delete":
      return "Delete";
    case "set_owner":
      return "Set Owner";
    case "change_timeline":
      return "Change timeline";
    case "set_starts_on":
      return "Set starts on";
    case "set_due":
      return "Set due on";
    case "set_list":
      return "Set project";
    case "set_section":
      return "Set project phase";
    case "change_section":
      return "Change project phase";
    default:
      return action;
  }
}

function retrieveSODData(tasks, user_id) {
  let currentTasks = tasks.filter(
    x =>
      x.owner_id === user_id &&
      (!x.due_on ||
        (x.due_on > moment().startOf("week") &&
          x.due_on < moment().endOf("week")))
  );
  let currentOutcomes = currentTasks.filter(x => x.parent_id == null);
  currentTasks = currentTasks.filter(x => x.parent_id != null);
  let outcomeFormatter = x => {
    return {
      project_name: projectMap.get(x.list_id),
      name: x.name,
      comments_count: x.comments_count,
      flagged: x.flagger_ids.length > 0 ? ":triangular_flag_on_post:" : "",
      start: x.starts_on && moment(x.starts_on).format("ll"),
      due: x.due_on && moment(x.due_on).format("ll"),
    };
  };
  let taskFormatter = x => {
    let outcome = tasks.find(task => task.id === x.parent_id);

    return {
      outcome_name: outcome ? outcome.name : x.parent_id,
      name: x.name,
      comments_count: x.comments_count,
      flagged: x.flagger_ids.length > 0 ? ":triangular_flag_on_post:" : "",
      start: x.starts_on && moment(x.starts_on).format("ll"),
      due: x.due_on && moment(x.due_on).format("ll"),
    };
  };
  let output = {
    outcomes: {
      todo: currentOutcomes
        .filter(
          x =>
            sectionMap.get(x.section_id) &&
            sectionMap.get(x.section_id).toLowerCase() === "todo"
        )
        .map(outcomeFormatter),
      doing: currentOutcomes
        .filter(
          x =>
            sectionMap.get(x.section_id) &&
            sectionMap.get(x.section_id).toLowerCase() === "doing"
        )
        .map(outcomeFormatter),
    },
    tasks: {
      todo: currentTasks
        .filter(
          x =>
            sectionMap.get(x.section_id) &&
            sectionMap.get(x.section_id).toLowerCase() === "todo"
        )
        .map(taskFormatter),
      doing: currentTasks
        .filter(
          x =>
            sectionMap.get(x.section_id) &&
            sectionMap.get(x.section_id).toLowerCase() === "doing"
        )
        .map(taskFormatter),
    },
  };

  let outcomeLogger = x =>
    console.log(
      x.flagged,
      "[" + x.project_name + "]",
      x.name,
      "-- comments",
      x.comments_count.toString().padStart(2, "0"),
      "-- start",
      x.start,
      "-- end",
      x.due
    );
  let taskLogger = x =>
    console.log(
      x.flagged,
      "[" + x.outcome_name + "]",
      x.name,
      "-- comments",
      x.comments_count.toString().padStart(2, "0"),

      "-- start",
      x.start,
      "-- end",
      x.due
    );
  console.log("\n `", userMap.get(user_id), "`");
  console.log("\n*What outcomes do I plan to achieve this week?*");
  if (output.outcomes.todo.length > 0) {
    console.log("\n_TODO_");
    output.outcomes.todo.forEach(outcomeLogger);
  }
  if (output.outcomes.doing.length > 0) {
    console.log("\n_DOING_");
    output.outcomes.doing.forEach(outcomeLogger);
  }
  console.log("\n*What tasks am I working on to achieve those outcomes?*");
  if (output.tasks.todo.length > 0) {
    console.log("\n_TODO_");
    output.tasks.todo.forEach(taskLogger);
  }
  if (output.tasks.doing.length > 0) {
    console.log("\n_DOING_");
    output.tasks.doing.forEach(taskLogger);
  }
}
