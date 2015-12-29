(function(){
    var app = angular.module('app', ['ngRoute', 'ngMaterial', 'ngAnimate', 'sparkline', 'Devise']);

    app.config(function($routeProvider, AuthProvider, $mdThemingProvider) {        
        
        AuthProvider.loginPath('https://weissman:3000/my/users/sign_in');
        AuthProvider.loginMethod('POST');
        AuthProvider.resourceName('Rebar')
        
        $mdThemingProvider.definePalette('customBlue', 
            $mdThemingProvider.extendPalette('light-blue', {
                'contrastDefaultColor': 'light',
                'contrastDarkColors': ['50'],
                '50': 'ffffff'
            })
        );

        $mdThemingProvider.theme('default')
            .primaryPalette('customBlue', {
                'default': '500',
                'hue-1': '50'
            })
            .accentPalette('pink');
        
        $mdThemingProvider.theme('input', 'default')
            .primaryPalette('grey')

        $routeProvider.
            when('/', {
                redirectTo: '/dash'
            }).
            when('/dash', {
                controller: 'DashCtrl',
                controllerAs: 'dash',
                templateUrl: 'dashboard.html',
            }).
            when('/login', {
                controller: 'LoginCtrl',
                controllerAs: 'login',
                templateUrl: 'login.html',
            }).
            otherwise({
                redirectTo: '/login'
            })
    });

    app.controller('AppCtrl', ['$scope', '$rootScope', '$mdSidenav', function($scope, $rootScope, $mdSidenav){
        $scope.toggleSideNav = function(menuId) {
            $mdSidenav(menuId).toggle();
        };

        $scope.menu = [
            {
                title: 'Dashboard',
                icon: 'dashboard',
                path: '/dash'
            },
            {
                title: 'Workloads',
                icon: 'work'
            },
            {
                title: 'Deployments',
                icon: 'view_column'
            },
            {
                title: 'Node',
                icon: 'dns'
            },
            {
                title: 'Networks',
                icon: 'swap_horiz'
            },
        ];

        $rootScope.icons = {
            'ready': 'check_circle',
            'error': 'warning',
            'process': 'autorenew',
            'todo': 'play_circle_outline',
            'off': 'power_settings_new',
            'queue': 'update',
            'reserved': 'pause_circle_outline',
        }

        $scope.admin = [
            {
                title: 'Settings',
                icon: 'settings'
            },
            {
                title: 'Users',
                icon: 'supervisor_account'
            },
        ];

    }]);

    app.controller('LoginCtrl', ['$rootScope', '$location', 'Auth', '$http', function($rootScope, $location, Auth, $http) {
        $rootScope.title = 'Login';
        $rootScope.isAuth = Auth.isAuthenticated

        console.log('login: ' + Auth._currentUser)
        this.credentials = {
            username: 'user',
            password: 'pass'
        }

        var login = this;

        this.signIn = function() {
            Auth.login(login.credentials, {interceptAuth: true}).
                then(function() {
                    $location.path("/dash")
                }).
                then(function(response) {
                    console.log(response);
                }, function(error) {
                    alert('Error');
                })
            
        }

        $rootScope.logout = function() {
            var config = {
                headers: {
                    'X-HTTP-Method-Override': 'DELETE'
                }
            };

            if(!Auth.isAuthenticated())
                return;

            Auth.logout(config).then(function(oldUser) {
                $location.path('/login');
            }, function(error) {
                console.log("Error logging out")
            });
        }

    }]);

    app.controller('DashCtrl', ['$mdMedia', '$mdDialog', '$rootScope', '$http', function($mdMedia, $mdDialog, $rootScope, $http) {
        $rootScope.title = 'Dashboard';

        var dash = this;
        this.deployments = [];


        this.showNodeDialog = function(ev, node) {
            console.log(node);
            $rootScope.node = node;
            var useFullScreen = ($mdMedia('sm') || $mdMedia('xs'))  && $scope.customFullscreen;
            $mdDialog.show({
                controller: 'DialogController',
                controllerAs: 'ctrl',
                templateUrl: 'nodedialog.tmpl.html',
                parent: angular.element(document.body),
                targetEvent: ev,
                locals: {
                    node: $rootScope.node
                },
                clickOutsideToClose: true,
                fullscreen: useFullScreen
            })
        };

        this.toggleExpand = function(deployment) {
            deployment.expand = !deployment.expand;
            if(deployment.expand) {
                $http.get('/example_deployment.json').
                    success(function(data){
                        deployment.data = data.deployment;
                        console.log("Update")
                    }).
                    error(function(){
                        console.log('No data!')
                    })
            }
        }

        this.opts = { // sparkline options
            sliceColors: [
                "#8BC34A", 
                "#F44336",
                "#03A9F4",
                "#616161"
            ],
            tooltipFormat: '{{value}}',
            disableTooltips: true,
            disableHighlight: true,
            borderWidth: 2,
            borderColor: '#fff',
            width: '2em',
            height: '2em',
        };

        $http.get('/example_dashboard.json').
            success(function(data){
                dash.deployments = data.deployments;
                for(var i in dash.deployments) {
                    console.log(i)
                    dash.deployments[i].data = {}
                }
            }).
            error(function(){

            })


    }]);

    app.run(function($rootScope, $location, Auth){
        console.log('Authenticated: '+Auth.isAuthenticated())

        $rootScope.$on('$locationChangeStart', function (event, next, current) {
            console.log("current:  "+next)

            if (!Auth.isAuthenticated()) {
                console.log("Redirecting "+current)
                $location.path('/login');
            }
        });

    });

    app.controller('DialogController', ['$scope', '$rootScope', '$mdDialog', 'locals', function ($scope, $rootScope, $mdDialog, locals) {
        $scope.locals = locals;
        $scope.icons = $rootScope.icons;

        $scope.hide = function() {
            $mdDialog.hide();
        };

        $scope.cancel = function() {
            $mdDialog.cancel();
        };

        $scope.answer = function(answer) {
            $mdDialog.hide(answer);
        };
    }]);

})();