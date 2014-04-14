$(function () {

    var oldBoundariesGeoJson,
        newBoundariesGeoJson,
        schoolsCollection,
        dataDeferred = $.when(
            $.get('data/old-boundaries.json', function (data) { oldBoundariesGeoJson = data; }),
            $.get('data/new-boundaries.json', function (data) { newBoundariesGeoJson = data; }),
            $.get('data/schools.json', function (data) { schoolsCollection = data; })
        ),
        template = _.template($('#template').html()),
        templateHelpers = {},

        tiles = L.tileLayer('http://api.tiles.mapbox.com/v3/cmgiven.hpfpddp6/{z}/{x}/{y}.png', {
            attribution: '<a href="https://www.mapbox.com">Mapbox</a>',
            maxZoom: 18
        }),
        homeIcon = L.AwesomeMarkers.icon({
            icon: 'home',
            markerColor: 'green',
            iconColor: 'white'
        }),
        schoolIcon1 = L.AwesomeMarkers.icon({
            icon: 'book',
            markerColor: 'blue',
            iconColor: 'white'
        }),
        schoolIcon2 = L.AwesomeMarkers.icon({
            icon: 'book',
            markerColor: 'orange',
            iconColor: 'white'
        }),
        blue = '#1f92c2',
        orange = '#e03f24',
        green = '',
        red = '#c31844';

    dataDeferred.done(function () {
        var locationData = dataForCoordinates({ lat: 38.911124, lon: -77.036799 });

        window.test = locationData;

        renderTemplate(locationData);
    });

    dataDeferred.fail(function () {
        // deal with AJAX errors
    });

    function renderTemplate(data) {
        data.helpers = templateHelpers;
        data.helpers.feedbackForm = _.template($('#feedback-form-template').html());
        $('#renderedTemplate').html(template(data));

        var boundaryMap = L.map('boundary-map')
            .setView(data.home, 14)
            .addLayer(tiles);

        data.newBoundary
            .setStyle({
                color: blue
            })
            .addTo(boundaryMap);

        L.marker(data.home, {icon: homeIcon}).addTo(boundaryMap);

        L.marker([data.newES.latitude, data.newES.longitude],{icon: schoolIcon1})
            .bindPopup('<b>' + data.newES.school_name + '</b><br />' + data.newES.address)
            .addTo(boundaryMap);
    }

    function dataForCoordinates(coords) {
        if (dataDeferred.state() !== 'resolved') { return; }

        coords = L.latLng(coords);

        var oldBoundariesGJLayer = L.geoJson(oldBoundariesGeoJson),
            newBoundariesGJLayer = L.geoJson(newBoundariesGeoJson),
            oldBoundary = leafletPip.pointInLayer(coords, oldBoundariesGJLayer)[0],
            newBoundary = leafletPip.pointInLayer(coords, newBoundariesGJLayer)[0],
            oldES = schoolForCode(oldBoundary.feature.properties.SCHOOLCODE),
            newES = schoolForCode(newBoundary.feature.properties.SCHOOLCODE),
            feederPattern = {
                'old': {
                    'es': oldES,
                    'ms': isNaN(oldES.old_fp_ms) ? oldES.old_fp_ms : schoolForCode(oldES.old_fp_ms),
                    'hs': isNaN(oldES.old_fp_hs) ? oldES.old_fp_hs : schoolForCode(oldES.old_fp_hs)
                },
                'new': {
                    'es': newES,
                    'ms': isNaN(newES.new_fp_ms) ? newES.new_fp_ms : schoolForCode(newES.new_fp_ms),
                    'hs': isNaN(newES.new_fp_hs) ? newES.new_fp_hs : schoolForCode(newES.new_fp_hs)
                }
            };

        function boundaryChanged() { return oldES !== newES; }

        function choiceSet() {
            var esSchools = _.map(newES.choice_set_schools, function (code) {
                return schoolForCode(code);
            });

            return {
                'es': {
                    'choiceSet': newES.choice_set,
                    'schools': esSchools
                }
            };
        }

        function nearestSchools(n, filter) {
            var schools = schoolsCollection;

            if (filter) { schools = _.filter(schools, filter); }

            schools = _.sortBy(schools, function(school) {
                return coords.distanceTo(L.latLng(school.latitude, school.longitude));
            });

            return _.first(schools, n);
        }

        function schoolForCode(code) {
            return _.where(schoolsCollection, { 'school_code': code })[0];
        }

        return {
            'home': coords,
            'oldBoundary': oldBoundary,
            'newBoundary': newBoundary,
            'boundaryChanged': boundaryChanged(),
            'oldES': oldES,
            'newES': newES,
            'feederPattern': feederPattern,
            'choiceSet': choiceSet(),
            'closestMiddleSchools': nearestSchools(2, function(school) {
                return _.intersection(school.grades, ['06', '07', '08']).length === 3;
            })
        };
    }

    templateHelpers.learndcURL = function (code) {
        code = code.length === 4 ? code : '0' + code;
        return 'http://www.learndc.org/schoolprofiles/view#' + code + '/overview';
    };

    templateHelpers.gradesString = function (arr) {
        var numeric = {
                'PS': -2,
                'PK': -1,
                'KG': 0,
                'AO': 14,
                'UN': 16
            },
            numArr = [],
            currentRun = [],
            runs = [],
            spelledOut = {
                '-2': 'Preschool',
                '-1': 'Pre-Kindergarten',
                '0': 'Kindergarten',
                '14': 'Adult',
                '16': 'Ungraded'
            },
            string = '',
            gradesUsed = false;

        for (i = 0; i < arr.length; i++) {
            num = (isNaN(arr[i])) ? numeric[arr[i]] : parseInt(arr[i], 10);
            numArr.push(num);
        }
        numArr.sort(function (a, b) { return a - b; });

        for (i = 0; i < numArr.length; i++) {
            if (i === 0 || numArr[i] === currentRun[currentRun.length - 1] + 1) {
                currentRun.push(numArr[i]);
            } else {
                runs.push(currentRun);
                currentRun = [numArr[i]];
            }
            if (i === numArr.length - 1) {
                runs.push(currentRun);
            }
        }

        for (i = 0; i < runs.length; i++) {
            var plural = runs[i].length > 1;
            if (runs[i][0] > 0 && runs[i][0] < 13) {
                if (plural) {
                    if (!gradesUsed) {
                        string += 'Grades ';
                        gradesUsed = true;
                    }
                    string += +runs[i][0] + '&ndash;' + runs[i][runs[i].length - 1];
                } else {
                    if (!gradesUsed) {
                        string += 'Grade ';
                    }
                    string += runs[i][0];
                }
            } else {
                string += spelledOut[runs[i][0]];
                if (plural) {
                    string += '&ndash;';
                    if (runs[i][runs[i].length - 1] > 0) {
                        string += 'Grade ' + runs[i][runs[i].length - 1];
                    } else {
                        string += spelledOut[runs[i][runs[i].length - 1]];
                    }
                }
            }
            if (i !== runs.length - 1) {
                string += ', ';
            }
        }

        return string;
    };

});