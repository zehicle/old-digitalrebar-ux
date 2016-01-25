(function(){

var app = angular.module('app');

app.filter('from', function() {
    return function(items, type, obj) {
        // _node | from:'deployment':deployment
        // gets all nodes with deployment_id == deployment.id
        var id = obj.id
        var result = [];
        angular.forEach(items, function(value, key) {
            if(value[type+"_id"] == id)
                result.push(value);
        });
        return result;
    };
});

app.run(function($rootScope, $cookies, api, $interval){
    // use regex to get the current location
    var currentLocation = /https:\/\/[^:\/]+/.exec(location.href)[0];
    $rootScope.host = $cookies.get('host') || currentLocation+':3000';

    $rootScope.$on('updateApi', function(event) {
        // make the api calls and add callbacks

        // capitalize function
        var capitalize = function (txt){
            return txt.charAt(0).toUpperCase() +
                txt.substr(1).toLowerCase();
        }

        // converts under_score to CamelCase
        var convert = function(name) {
            return "get"+name.split("_").map(capitalize).join("")
        }

        var fetch = ['deployments', 'roles', 'nodes', 'node_roles',
            'deployment_roles', 'networks', 'providers']

        // loops through 'fetch', calling api.getDeployments 
        //      and emitting the proper callback (deploymentsDone)
        fetch.forEach(function(name){
            api[convert(name)]().success(function(){
                $rootScope.$broadcast(name+'Done')
            })
        })
    })

    $rootScope.$on('startUpdating', function(event){
        $rootScope.$emit('updateApi')

        $interval(function(){
            $rootScope.$emit('updateApi')
        }, 3 * 60 * 1000 /* 3 minutes */ )

        api('/api/status/active', {
            method: 'PUT',
            data: {
                "nodes": Object.keys($scope._nodes)
            }
        })
    })

    $rootScope.tryFetch = function() {
        $rootScope.$emit('updateApi')
    }

    $rootScope._deployments = {}
    $rootScope._deployment_roles = {}
    $rootScope._roles = {}
    $rootScope._nodes = {}
    $rootScope._networks = {}
    $rootScope._node_roles = {}
    $rootScope._providers = {}

})

app.factory('api', function($http, $rootScope) {


    // function for calling api functions ( eg. /api/v2/nodes )
    // to use:
    // api('/path/to/api', {data: {asdf}, method: 'GET'}).success(function(data){}).error(function(data){})
    var api = function(path, args) {
        args = args || {};
        args.method = args.method || 'GET';
        args.headers = args.headers || {}
        args.api = true;
        args.url = $rootScope.host+path;
        return $http(args)
    }

    api.addDeployment = function(deployment) {
        var id = deployment.id
        $rootScope._deployments[id] = deployment
    }

    api.getDeployments = function() {
        return api('/api/v2/deployments').
            success(function(data){
                $rootScope._deployments = {}
                data.map(api.addDeployment)
            })
    }

    api.addNode = function(node) {
        var id = node.id
        
        node.address = node['node-control-address']

        var state = $rootScope.states[node.state]
        if(!node.alive)
            state = 'off'
        node.status = state

        // assign simple states for the dashboard pie chart
        if(!node.alive)
            node.simpleState = 3; //off
        else {
            node.simpleState = 2; // todo
            if(node.state == -1)
                node.simpleState = 1; // error
            if(node.state == 0)
                node.simpleState = 0; // ready
        }

        $rootScope._nodes[id] = node
    }

    // api call for getting all the nodes
    api.getNodes = function() {
        return api('/api/v2/nodes').
            success(function(data){
                $rootScope._nodes = {}
                data.map(api.addNode)
            })
    }

    api.addRole = function(role) {
        var id = role.id
        $rootScope._roles[id] = role
    }

    // api call for getting all the roles
    api.getRoles = function() {
        return api('/api/v2/roles').
            success(function(data){
                $rootScope._roles = {}
                data.map(api.addRole)
            })
    }

    api.addDeploymentRole = function(role) {
        role.cohort = function(){$rootScope._roles[role.role_id].cohort}
        $rootScope._deployment_roles[role.id] = role
    }

    // api call for getting all the deployment roles
    api.getDeploymentRoles = function() {
        return api('/api/v2/deployment_roles').
            success(function(data){
                $rootScope._deployment_roles = {}
                data.map(api.addDeploymentRole)
            })
    }

    api.addProvider = function(provider) {
        var id = provider.id
        $rootScope._providers[id] = provider
    }

    // api call for getting all the providers
    api.getProviders = function() {
        return api('/api/v2/providers').
            success(function(data){
                $rootScope._providers = {}
                data.map(api.addProvider)
            })
    }

    api.addNetwork = function(network) {
        var id = network.id
        $rootScope._networks[id] = network
    }

    // api call for getting all the providers
    api.getNetworks = function() {
        return api('/api/v2/networks').
            success(function(data){
                $rootScope._networks = {}
                data.map(api.addNetwork)
            })
    }

    api.addNodeRole = function(role) {
        var id = role.id

        $rootScope._node_roles[id] = role

        role.status = $rootScope.states[role.state]
    }

    // api call for getting all the node roles
    api.getNodeRoles = function() {
        return api('/api/v2/node_roles?runlog').
            success(function(data){
                $rootScope._node_roles = {}
                data.map(api.addNodeRole)
            })
    }

    return api;
    
})

})();