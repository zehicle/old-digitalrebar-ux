(function () {

  // capitalize function
  function capitalize(txt) {
    return txt.charAt(0).toUpperCase() +
      txt.substr(1).toLowerCase();
  }

  // converts under_score to CamelCase
  function camelCase(name) {
    return name.split("_").map(capitalize).join("");
  }

  var app = angular.module('app');

  app.filter('from', function () {
    return function (items, type, obj) {
      // _node | from:'deployment':deployment
      // gets all nodes with deployment_id == deployment.id
      var id = obj && obj.id || 0;
      var result = [];
      angular.forEach(items, function (value, key) {
        if (value[type + "_id"] == id)
          result.push(value);
      });
      return result;
    };
  });
  app.run(function ($rootScope, $cookies, api, $interval, debounce) {
    // use regex to get the current location
    var currentLocation = "https://" + location.hostname;
    $rootScope.host = $cookies.get('host') || currentLocation;

    $rootScope.$on('updateApi', function (event) {
      api.reloading = true;
      api.getHealth();
      api.getUsers();

      // make the api calls and add callbacks
      function finishReloading () {
        api.reloading = false;
      }

      // loops through 'fetch', calling api.getDeployments 
      //      and emitting the proper callback (deploymentsDone)
      app.types.forEach(function (name) {
        api["get" + camelCase(name)]().success(function () {
          $rootScope.$broadcast(name + 'Done');
          debounce(finishReloading, 2000)();
        });
      });
    });

    $rootScope.$on('startUpdating', function (event) {
      api.reload();
      api.getActive();
    });

    $rootScope.tryFetch = function () {
      $rootScope.$emit('updateApi');
    };

    $rootScope._deployments = {};
    $rootScope._deployment_roles = {};
    $rootScope._roles = {};
    $rootScope._nodes = {};
    $rootScope._networks = {};
    $rootScope._node_roles = {};
    $rootScope._providers = {};
    $rootScope._barclamps = {};
    $rootScope.wizardBarclamps = [];

    $rootScope.showDNS = false;
    $rootScope._DNS = { zones: [] };

    $rootScope.showDHCP = false;
    $rootScope._DHCP = { subnets: [] };

    $rootScope.showProvisioner = false;
    $rootScope._provisioner = { bootenvs: [], templates: [], machines: [] };

    $rootScope._users = {};
    $rootScope._tenants = {};
    $rootScope._capabilities = {};

  });

  app.factory('api', function ($http, $rootScope, $timeout, $mdToast, debounce, localStorageService) {


    // function for calling api functions ( eg. /api/v2/nodes )
    // to use:
    // api('/path/to/api', {data: {asdf}, method: 'GET'}).success(function(data){}).error(function(data){})
    var api = function (path, args) {
      args = args || {};
      args.method = args.method || 'GET';
      args.headers = args.headers || {};
      args.api = true;
      args.url = $rootScope.host + path;
      return $http(args);
    };
    api.reloading = false;

    app.types = ['deployments', 'roles', 'nodes', 'node_roles',
      'deployment_roles', 'networks', 'providers', 'barclamps'
    ];

    api.testSchema = function (data, schema) {
      if (typeof data === 'undefined' && !schema.required)
        return true;

      switch (schema.type) {
      case 'any': // data is anything
        return true;

      case 'str': // data is a string
        if  (typeof data != 'string')
          return false;

        if (!schema.pattern)
          return true;

        var regex = new RegExp(schema.pattern.substr(1, schema.pattern.length - 2));
        return !!data.match(regex);

      case 'bool': // data is a boolean
        return typeof data == 'boolean';

      case 'int': // data is a number
        return typeof data == 'number';

      case 'seq': // data is an array
        if (typeof data != 'object' || !Array.isArray(data))
          return false;

        var newSchema = schema.sequence[0];
        // test all items in data against the schema's sequence
        for (var i in data) {
          if (!api.testSchema(data[i], newSchema))
            return false;
        }

        return true;
      case 'map': // data is a hash table
        if (typeof data != 'object' || Array.isArray(data))
          return false;

        // handle cases where '=' is the only thing passed in mapping
        if(typeof schema.mapping['='] !== 'undefined') {
          var newSchema = schema.mapping['='];
          for (var key in data) {
            if (!api.testSchema(data[key], newSchema))
              return false;
          }
        } else {
          // check if data's children are valid
          for (var key in schema.mapping) {
            var newSchema = schema.mapping[key];
            if (!api.testSchema(data[key], newSchema))
              return false;
          }

          // check if data has extra keys
          for (var key in data) {
            if (typeof schema.mapping[key] === 'undefined')
              return false;
          }
          
        }


        return true;
      }
      return false;
    }

    api.exampleFromSchema = function (schema) {
      switch (schema.type) {
      case 'any':
        return '=' + (schema.required ? '*' : '');
        
      case 'str':
        return 'string' + (schema.required ? '*' : '') + (schema.pattern ? ' ' + schema.pattern : '');

      case 'bool':
        return 'boolean' + (schema.required ? '*' : '');

      case 'int':
        return 'number' + (schema.required ? '*' : '');

      case 'seq':
        var newSchema = schema.sequence[0];
        newSchema.required = schema.required;
        var arr = [api.exampleFromSchema(newSchema)];
        return arr;

      case 'map': 
        var map = {};
        for (var key in schema.mapping) {
          var newSchema = schema.mapping[key];
          map[key] = api.exampleFromSchema(newSchema);
        }
        return map;
      }
    }


    api.lastUpdate = new Date().getTime();

    api.queue = [];
    api.queueLen = 0;

    api.errors = localStorageService.get('errors') || [];

    api.toast = function (message, error, err) {
      $mdToast.show(
        $mdToast.simple()
        .textContent(message)
        .position('bottom left')
        .hideDelay(3000)
      );
      if (error) {
        api.errors.push({ type: error, message: message, err: err, stack: new Error().stack, date: Date.now() });
        localStorageService.add('errors', api.errors);
      }
    };

    api.fetch = function (name, id) {
      return api("/api/v2/" + name + "s/" + id).
      success(function (obj) {
        api["add" + camelCase(name)](obj);
      }).
      error(function (err) {
        if(err === "Unauthorized\n") {
          $rootScope.$broadcast(name+id+'Done');
          return;
        }
        api.remove(name, id);
        $rootScope.$broadcast(name+id+'Done');
      });
    };

    api.reload = function () {
      $rootScope.$emit('updateApi')
      api.lastUpdate = new Date().getTime();
      debounce(api.reload, 3 * 60 * 1000, false)();
    };


    // add an api call to the queue
    api.addQueue = function (name, id) {
      api.queue.push(function () {
        api.fetch(name, id).
        success(api.nextQueue).
        error(api.nextQueue);
      });
    };

    api.nextQueue = function () {
      // if the queue isn't empty
      if (api.queue.length) {
        // eval and remove the first one
        $rootScope.$evalAsync(
          api.queue.splice(0, 1)[0]
        );
      } else { // queue is empty, wait and populate it
        api.queueLen = 0;
        $timeout(api.getActive, 15 * 1000 /* 15 seconds */ );
      }
    };

    api.getActive = function () {
      // time since last update in seconds
      var deltaTime = Math.ceil((new Date().getTime() - api.lastUpdate) / 1000);

      api('/api/status/active', {
        method: 'PUT',
        params: {
          "age": deltaTime
        },
        data: { // sending only the IDs of nodes and deployments
          "nodes": Object.keys($rootScope._nodes).map(Number),
          "deployments": Object.keys($rootScope._deployments).map(Number)
        }
      }).success(function (data) {
        api.lastUpdate = new Date().getTime();
        for (var type in data.changed) {
          // using forEach for asynchronous api calls
          data.changed[type].forEach(function (id) {
            // remove the plural from the type (nodes -> node)
            var name = /^.*(?=s)/.exec(type)[0];
            api.addQueue(name, id);
          });
        }

        for (var type in data.deleted) {
          for (var i in data.deleted[type]) {
            var id = data.deleted[type][i];
            var name = /^.*(?=s)/.exec(type)[0];
            try {
              api.remove(name, id);
            } catch (e) {
              console.warn(e);
            }
          }
        }

        api.queueLen = api.queue.length;
        // start the queue
        api.nextQueue();
      }).error(function (resp) {
        console.warn(resp);
        api.nextQueue();
      });
    };

    api.getHealth = function () {
      api('/health').success(function (data) {
        var map = data.Map;
        $rootScope.showDNS = typeof map['dns-mgmt-service'] !== 'undefined';
        $rootScope.showDHCP = typeof map['dhcp-mgmt-service'] !== 'undefined';
        $rootScope.showProvisioner = typeof map['provisioner-mgmt-service'] !== 'undefined';

        if ($rootScope.showDNS) {
          api('/dns/zones').success(function (data) {
            $rootScope._DNS.zones = data;
          });
        }

        if ($rootScope.showDHCP) {
          api('/dhcp/subnets').success(function (data) {
            $rootScope._DHCP.subnets = data;
          });
        }

        if ($rootScope.showProvisioner) {
          api('/provisioner/machines').success(function (data) {
            $rootScope._provisioner.machines = data;
          });
          api('/provisioner/templates').success(function (data) {
            $rootScope._provisioner.templates = data;
          });
          api('/provisioner/bootenvs').success(function (data) {
            $rootScope._provisioner.bootenvs = data;
          });
        }

      }).error(function () {
        $rootScope.showDNS = false;
        $rootScope.showDHCP = false;
        $rootScope.showProvisioner = false;
      });
    };

    var inOrderMap = function (map, arr, depth) {
      if (typeof depth === 'undefined')
        depth = 0;
      for (var i in map) {
        arr.push(map[i]);
        map[i].depth = depth;
        inOrderMap(map[i].children, arr, depth + 1);
      }
    };

    api.getUsers = function () {
      api("/api/v2/users").
      success(function (users) {
        $rootScope._users = {};
        for (var i in users) {
          users[i].caps = {};
          $rootScope._users[users[i].id] = users[i];
        }

        // get capabilities for all users after getting users
        api("/api/v2/user_tenant_capabilities").
        success(function (caps) {
          for (var i in caps) {
            var cap = caps[i];
            if (!$rootScope._users[cap.user_id].caps[cap.tenant_id]) {
              $rootScope._users[cap.user_id].caps[cap.tenant_id] = {
                id: cap.tenant_id,
                caps: []
              };
            }
            $rootScope._users[cap.user_id].caps[cap.tenant_id].caps.push(cap.capability_id);
          }

        });

        // get a list of tenants
        api("/api/v2/tenants").
        success(function (arr) {
          $rootScope._tenants = {};
          for (var i in arr) {
            arr[i].children = [];
            arr[i].users = [];          
            $rootScope._tenants[arr[i].id] = arr[i];

            // initialize empty caps where necessary
            for (var j in users) {
              if(typeof users[j].caps[arr[i].id] === 'undefined')
                users[j].caps[arr[i].id] = {
                id: arr[i].id,
                caps: []
              };
            }
          }

          // move applicable users into their respected tenants
          for (var i in users) {
            $rootScope._tenants[users[i].tenant_id].users.push(users[i]);
          }

          // get the parents of each tenant and put tenants into map form
          var parents = [];
          for (var i in $rootScope._tenants) {
            var tenant = $rootScope._tenants[i];
            if (typeof tenant.parent_id === 'undefined' || !$rootScope._tenants[tenant.parent_id])
              parents.push(tenant)
            else {
              $rootScope._tenants[tenant.parent_id].children.push(tenant)
            }
          }

          // make an array with tenants traversed inOrder
          $rootScope._tenantsInOrder = [];
          inOrderMap(parents, $rootScope._tenantsInOrder);

        });
      });


      // get a list of capabilities
      api("/api/v2/capabilities").
      success(function (arr) {
        $rootScope._capabilities = {};
        for (var i in arr)
          $rootScope._capabilities[arr[i].id] = arr[i];
      });
    };

    api.remove = function (type, parentId) {
      if (typeof parentId === 'undefined')
        return;

      if (!$rootScope['_' + type + 's'][parentId])
        return;

      console.log('removing ' + type + ' ' + parentId);
      
      delete $rootScope['_' + type + 's'][parentId];
      $rootScope.$broadcast(type + parentId + "Done");

      if (type == 'deployment') {
        ['nodes', 'node_roles'].forEach(function (item) {
          var name = /^.*(?=s)/.exec(item)[0];
          for (var id in $rootScope['_' + item]) {
            var child = $rootScope['_' + item][id];
            if (child.deployment_id == parentId)
              api.addQueue(name, id);
          }
        });
      }

    };


    api.addDeployment = function (deployment) {
      var id = deployment.id;
      $rootScope._deployments[id] = deployment;
      $rootScope.$broadcast("deployment" + id + "Done");
    };

    api.getDeployments = function () {
      return api('/api/v2/deployments').
      success(function (data) {
        $rootScope._deployments = {};
        data.map(api.addDeployment);
      });
    };

    api.addNode = function (node) {
      var id = node.id;

      node.address = node['node-control-address'];

      var state = $rootScope.states[node.state];
      if (!node.alive) {
        state = 'off';
        if (node.reserved)
          state = 'reserved';
      }
      node.status = state;

      // assign simple states for the dashboard pie chart
      if (!node.alive)
        node.simpleState = 3; //off
      else {
        node.simpleState = 2; // todo
        if (node.state == -1)
          node.simpleState = 1; // error
        if (node.state == 0)
          node.simpleState = 0; // ready
      }

      $rootScope._nodes[id] = node;
      $rootScope.$broadcast("node" + id + "Done");
    };

    // api call for getting all the nodes
    api.getNodes = function () {
      return api('/api/v2/nodes').
      success(function (data) {
        $rootScope._nodes = {};
        data.map(api.addNode);
      });
    };

    api.addRole = function (role) {
      var id = role.id;
      $rootScope._roles[id] = role;
      $rootScope.$broadcast("role" + id + "Done");
    };

    // api call for getting all the roles
    api.getRoles = function () {
      return api('/api/v2/roles').
      success(function (data) {
        $rootScope._roles = {};
        data.map(api.addRole);
      });
    };

    api.addDeploymentRole = function (role) {
      // allow deployment roles to be sorted by cohort
      role.cohort = function () {
        return $rootScope._roles[role.role_id].cohort;
      };
      var id = role.id;
      $rootScope._deployment_roles[id] = role;
      $rootScope.$broadcast("deployment_role" + id + "Done");
    };

    // api call for getting all the deployment roles
    api.getDeploymentRoles = function () {
      return api('/api/v2/deployment_roles').
      success(function (data) {
        $rootScope._deployment_roles = {};
        data.map(api.addDeploymentRole);
      });
    };

    api.addProvider = function (provider) {
      var id = provider.id;
      $rootScope._providers[id] = provider;
      $rootScope.$broadcast("provider" + id + "Done");
    };

    // api call for getting all the providers
    api.getProviders = function () {
      return api('/api/v2/providers').
      success(function (data) {
        $rootScope._providers = {};
        data.map(api.addProvider);
      });
    };

    api.addNetwork = function (network) {
      var id = network.id;
      $rootScope._networks[id] = network;
      $rootScope.$broadcast("network" + id + "Done");
    };

    // api call for getting all the providers
    api.getNetworks = function () {
      return api('/api/v2/networks').
      success(function (data) {
        $rootScope._networks = {};
        data.map(api.addNetwork);
      });
    };

    api.addNodeRole = function (role) {
      var id = role.id;
      role.status = $rootScope.states[role.state];

      delete $rootScope._node_roles[id];
      $rootScope._node_roles[id] = role;
      $rootScope.$broadcast("node_role" + id + "Done");
    };

    // api call for getting all the node roles
    api.getNodeRoles = function () {
      return api('/api/v2/node_roles').
      success(function (data) {
        $rootScope._node_roles = {};
        data.map(api.addNodeRole);
      });
    };

    api.addBarclamp = function (barclamp) {
      var id = barclamp.id;
      $rootScope._barclamps[id] = barclamp;
      $rootScope.$broadcast("barclamp" + id + "Done");

      if (typeof barclamp.cfg_data.wizard !== 'undefined') {

        if (barclamp.cfg_data.wizard.version != 2)
          return;

        var exists = false;
        for (var i in $rootScope.wizardBarclamps) {
          var b = $rootScope.wizardBarclamps[i];
          if (b.id == id) {
            exists = true;
            break;
          }
        }
        if (!exists) {
          $rootScope.wizardBarclamps.push({
            id: id,
            title: barclamp.cfg_data.wizard.name,
            icon: barclamp.cfg_data.wizard.icon || 'create_new_folder',
            path: '/workloads/' + id
          });
        }
      }
    };

    // api call for getting all the barclamps
    api.getBarclamps = function () {
      return api('/api/v2/barclamps').
      success(function (data) {
        $rootScope._barclamps = {};
        data.map(api.addBarclamp);
      });
    };

    return api;

  });

})();
