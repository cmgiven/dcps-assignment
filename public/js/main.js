$(function () {

    var currentSession,
        oldBoundariesGeoJson,
        msBoundariesGeoJson,
        hsBoundariesGeoJson,
        newBoundariesGeoJson,
        schoolsCollection,
        dataDeferred = $.when(
            $.get('data/old-boundaries.json', function (data) { oldBoundariesGeoJson = data; }),
            $.get('data/ms-boundaries.json', function (data) { msBoundariesGeoJson = data; }),
            $.get('data/hs-boundaries.json', function (data) { hsBoundariesGeoJson = data; }),
            $.get('data/new-boundaries.json', function (data) { newBoundariesGeoJson = data; }),
            $.get('data/schools.json', function (data) { schoolsCollection = data.schools; window.dataVersion = data.version; })
        ),
        template = _.template($('#template').html()),
        templateHelpers = {},

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
        green = '#5b9f25',
        red = '#c31844',
        alertTemplate = _.template('<div id="<%= id %>" class="<%= type %> alert"><p><%= text %></p></div>');

    dataDeferred.fail(function () {
        $('#address-form').after(alertTemplate({
            id: 'ajax-fail',
            type: 'warning',
            text: "We ran into an unexpected problem downloading data. Try refreshing the page, or <a href='mailto:chris@ourdcschools.org'>send us an email</a> so we can help."
        }));
    });

    var Session = Backbone.Model.extend({
        urlRoot: '/api/sessions',
        idAttribute: '_id',
        defaults: {
            address: '',
            latitude: 0.0,
            longitude: 0.0,
            ward: '',
            cluster: '',
            oldBoundary: '',
            newBoundary: '',
            responses: [],
            name: '',
            gaVisitID: '',
            versions: {}
        },
        saveFeedback: function (question, args) {
            var responses = this.get('responses');

            if (_.where(responses, { 'key': question }).length === 0) {
                responses.push({ 'key': question, 'value': 0, 'comment': ''});
            }

            _.each(args, function (v, k) {
                _.where(responses, { 'key': question })[0][k] = v;
            });

            this.save({ responses: responses });
        }
    });

    $('#address-lookup').on('submit', function (e) {
        e.preventDefault();

        if ($('#address-validate').attr('disabled')) { return; }
        $('#address-validate').attr('disabled', 'disabled');

        $('#bad-address').remove();
        $('#renderedTemplate').html('');

        lookupAddress($('#address').val(), function (data) {
            $('#address-validate').removeAttr('disabled');
            if (data) {
                dataDeferred.done(function () {
                    var locationData = dataForCoordinates({ lat: data.lat, lon: data.lon });
                    window.test = locationData;
                    $('#address').val(data.address);
                    renderTemplate(locationData);

                    currentSession = new Session();
                    currentSession.save({
                        address: data.address,
                        latitude: data.lat,
                        longitude: data.lon,
                        ward: data.ward,
                        cluster: data.nc,
                        oldBoundary: locationData.oldBoundary.feature.properties.SCHOOLNAME,
                        newBoundary: locationData.newBoundary.feature.properties.SCHOOLNAME,
                        gaVisitID: window.GUID,
                        versions: { template: window.templateVersion, data: window.dataVersion }
                    });
                });
            } else {
                $('#address-form').after(alertTemplate({
                    id: 'bad-address',
                    type: 'warning',
                    text: "We couldn't find a match for your address. Please check that everything is correct, or <a href='mailto:chris@ourdcschools.org'>send us an email</a> so we can help."
                }));
            }
        });
    });

    function lookupAddress(address, callback) {
        if (address) {
            $.post('/api/dcgis', {address: address}, function (data) {
                var address,
                    latitude,
                    longitude,
                    ward,
                    neighborhoodCluster,
                    returnedAddresses = $(data).find('FULLADDRESS');
                if (returnedAddresses.length === 1) {
                    address = $(returnedAddresses[0]).text();
                    latitude = parseFloat($($(data).find('LATITUDE')[0]).text());
                    longitude = parseFloat($($(data).find('LONGITUDE')[0]).text());
                    ward = $($(data).find('WARD_2012')[0]).text();
                    neighborhoodCluster = $($(data).find('CLUSTER_')[0]).text();

                    callback({
                        'address': address,
                        'lat': latitude,
                        'lon': longitude,
                        'ward': ward,
                        'nc': neighborhoodCluster
                    });
                } else {
                    callback();
                }
            });
        } else {
            callback();
        }
    }

    function renderTemplate(data) {
        data.helpers = templateHelpers;
        data.helpers.feedbackForm = _.template($('#feedback-form-template').html());
        $('#renderedTemplate').hide().html(template(data)).fadeIn();

        var boundaryMap = L.map('boundary-map')
            .setView(data.home, 14)
            .addLayer(L.tileLayer('http://api.tiles.mapbox.com/v3/cmgiven.hpfpddp6/{z}/{x}/{y}.png', {
                attribution: '<a href="https://www.mapbox.com">Mapbox</a>',
                maxZoom: 18
        }));

        if (data.newBoundary.feature.properties.CHANGE !== 'unchanged.') {
            data.oldBoundary
                .setStyle({
                    color: orange,
                    weight: 3,
                    opacity: 1,
                    fillOpacity: 0
                })
                .addTo(boundaryMap);

            if (data.mergedBoundaries.length > 0) {
                _.each(data.mergedBoundaries, function (layer) {
                    layer.setStyle({
                        color: orange,
                        weight: 3,
                        opacity: 0.5,
                        fillOpacity: 0
                    })
                    .addTo(boundaryMap);
                });
            }
        }

        data.newBoundary
            .setStyle({
                color: blue,
                weight: 3,
                opacity: 1,
                fillOpacity: 0
            })
            .addTo(boundaryMap);

        L.marker(data.home, {icon: homeIcon}).addTo(boundaryMap);

        if (data.boundaryChanged && _.isObject(data.oldES)) {
            L.marker([data.oldES.latitude, data.oldES.longitude],{icon: schoolIcon2})
                .bindPopup('<b>' + data.oldES.school_name + '</b><br />' + data.oldES.address)
                .addTo(boundaryMap);
        }

        L.marker([data.newES.latitude, data.newES.longitude],{icon: schoolIcon1})
            .bindPopup('<b>' + data.newES.school_name + '</b><br />' + data.newES.address)
            .addTo(boundaryMap);

        var closestMiddleSchoolsMap = L.map('closest-middle-schools-map')
            .setView(data.home, 13)
            .addLayer(L.tileLayer('http://api.tiles.mapbox.com/v3/cmgiven.hpfpddp6/{z}/{x}/{y}.png', {
                attribution: '<a href="https://www.mapbox.com">Mapbox</a>',
                maxZoom: 18
        }));

        L.marker(data.home, {icon: homeIcon}).addTo(closestMiddleSchoolsMap);

        L.marker([data.closestMiddleSchools[0].latitude, data.closestMiddleSchools[0].longitude],{icon: schoolIcon1})
            .bindPopup('<b>' + data.closestMiddleSchools[0].school_name + '</b><br />' + data.closestMiddleSchools[0].address)
            .addTo(closestMiddleSchoolsMap);

        L.marker([data.closestMiddleSchools[1].latitude, data.closestMiddleSchools[1].longitude],{icon: schoolIcon2})
            .bindPopup('<b>' + data.closestMiddleSchools[1].school_name + '</b><br />' + data.closestMiddleSchools[1].address)
            .addTo(closestMiddleSchoolsMap);

        $('ul.graphic-likert input').on('change', function () {
            var question = $(this).attr('name'),
                value = $(this).val();

            currentSession.saveFeedback(question, { 'value': value });

            $('#' + question + '-comment').fadeIn();
        });

        $('textarea.comment').on('blur', function () {
            var question = this.id.split('-')[0],
                value = $(this).val();
            
            currentSession.saveFeedback(question, { 'comment': value });
        });

        $('textarea.comment').on('input', function () {
            var $this = $(this),
                offset = 26;
            $this.css('height', 'auto');
            $this.css('height', $this.prop("scrollHeight") + offset);
        });

        $('#name').on('submit', function (e) {
            e.preventDefault();

            if ($('#name-submit').attr('disabled')) { return; }
            $('#name-submit').attr('disabled', 'disabled');

            currentSession.save({ 'name': $('#name-field').val() });

            $('#submit-success').remove();
            setTimeout(function () {
                $('#name-submit').removeAttr('disabled');

                $('#name-form').after(alertTemplate({
                    id: 'submit-success',
                    type: 'success',
                    text: "Thank you for your feedback. If you have an interest in obtaining the responses and/or raw data, please <a href='mailto:chris@ourdcschools.org'>send us an email</a>."
                }));
            }, 800);
        });

        $('a').click(function(){
            $('html, body').animate({
                scrollTop: $( $.attr(this, 'href') ).offset().top
            }, 500);
            return false;
        });
    }

    function dataForCoordinates(coords) {
        if (dataDeferred.state() !== 'resolved') { return; }

        coords = L.latLng(coords);

        var oldBoundariesGJLayer = L.geoJson(oldBoundariesGeoJson),
            msBoundariesGJLayer = L.geoJson(msBoundariesGeoJson),
            hsBoundariesGJLayer = L.geoJson(hsBoundariesGeoJson),
            newBoundariesGJLayer = L.geoJson(newBoundariesGeoJson),
            oldBoundary = leafletPip.pointInLayer(coords, oldBoundariesGJLayer)[0],
            msBoundary = leafletPip.pointInLayer(coords, msBoundariesGJLayer)[0],
            hsBoundary = leafletPip.pointInLayer(coords, hsBoundariesGJLayer)[0],
            newBoundary = leafletPip.pointInLayer(coords, newBoundariesGJLayer)[0],
            oldEScode = oldBoundary.feature.properties.SCHOOLCODE,
            oldMScode = msBoundary.feature.properties.SCHOOLCODE,
            oldHScode = hsBoundary.feature.properties.SCHOOLCODE,
            newEScode = newBoundary.feature.properties.SCHOOLCODE,
            oldES = oldEScode > 0 ? schoolForCode(oldEScode) : 'CLOSED',
            newES = schoolForCode(newEScode),
            feederPattern = {
                'old': oldES !== 'CLOSED' ? {
                    'es': oldES,
                    'ms': isNaN(oldES.old_fp_ms) ? oldES.old_fp_ms : schoolForCode(oldES.old_fp_ms),
                    'hs': isNaN(oldES.old_fp_hs) ? oldES.old_fp_hs : schoolForCode(oldES.old_fp_hs)
                } : { 'es': null, 'ms': null, 'hs': null },
                'new': {
                    'es': newES,
                    'ms': isNaN(newES.new_fp_ms) ? newES.new_fp_ms : schoolForCode(newES.new_fp_ms),
                    'hs': isNaN(newES.new_fp_hs) ? newES.new_fp_hs : schoolForCode(newES.new_fp_hs)
                }
            };

        function boundaryChanged() { return oldES !== newES; }

        function mergedBoundaries() {
            return _.filter(oldBoundariesGJLayer._layers, function (layer) {
                return layer.feature.properties.SCHOOLCODE === oldEScode && layer !== oldBoundary;
            });
        }

        function choiceSet() {
            var esSchools = _.map(newES.choice_set_schools, function (code) {
                    return schoolForCode(code);
                }),
                msSchools = newES.ms_choice_set ? _.map(newES.ms_choice_set, function (code) {
                    return schoolForCode(code);
                }) : null;

            return {
                'es': {
                    'choiceSet': newES.choice_set,
                    'schools': esSchools
                },
                'ms': {
                    'schools': msSchools
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

        function setAsides() {
            var eligible,
                fpSchools = _.values(feederPattern['new']),
                allSchools = _.union(fpSchools, choiceSet().es, choiceSet().ms),
                acceptingSchools = _.where(allSchools, { 'esea': 'Reward' }),
                eligibleLevels = _.keys(_.omit(feederPattern['new'], function (school) {
                    return school.esea !== 'Priority';
                })),
                dict = { 'es': 'elementary', 'ms': 'middle', 'hs': 'high' };

            if (eligibleLevels.length > 0) {
                eligible = dict[eligibleLevels[0]];
                if (eligibleLevels.length === 2) {
                    eligible = eligible + ' and ' + dict[eligibleLevels[1]];
                } else if (eligibleLevels.length === 3)  {
                    eligible = eligible + ', ' + dict[eligibleLevels[1]] + ', and ' + dict[eligibleLevels[2]];
                }
            } else {
                eligible = false;
            }

            return {
                eligible: eligible,
                accepting: acceptingSchools
            };
        }

        function boundaryMS() {
            var fpMS = _.isObject(feederPattern.old.ms) ? feederPattern.old.ms.school_code : null;

            if (oldMScode > 0 && oldMScode !== fpMS) { return schoolForCode(oldMScode); }

            return false;
        }

        function boundaryHS() {
            var fpHS = _.isObject(feederPattern.old.hs) ? feederPattern.old.hs.school_code : null;

            if (oldHScode > 0 && oldHScode !== fpHS) { return schoolForCode(oldHScode); }

            return false;
        }

        function schoolForCode(code) {
            if (isNaN(code)) { return code; }
            return _.where(schoolsCollection, { 'school_code': code })[0];
        }

        return {
            'home': coords,
            'oldBoundary': oldBoundary,
            'newBoundary': newBoundary,
            'boundaryChanged': boundaryChanged(),
            'mergedBoundaries': mergedBoundaries(),
            'oldES': oldES,
            'newES': newES,
            'feederPattern': feederPattern,
            'boundaryMS': boundaryMS(),
            'boundaryHS': boundaryHS(),
            'choiceSet': choiceSet(),
            'closestMiddleSchools': nearestSchools(2, function(school) {
                if (school.school_type !== 'Alternative Education School' && school.charter_status === false) {
                    return _.intersection(school.grades, ['06', '07', '08']).length === 3;
                }

                return false;
            }),
            'setAsides': setAsides()
        };
    }

    templateHelpers.learndcURL = function (code) {
        code = code.length === 4 ? code : '0' + code;
        return 'http://www.learndc.org/schoolprofiles/view?s=' + code + '#overview';
    };

    templateHelpers.learndcLink = function (school) {
        return '<a href="' +
            templateHelpers.learndcURL(school.school_code) +
            '" target="_blank">' +
            school.school_name +
            '</a>';
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
