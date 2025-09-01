
const DIGITRANSIT_SUBSCRIPTION_KEY = "bbc7a56df1674c59822889b1bc84e7ad"

mapboxgl.accessToken = 'pk.eyJ1IjoiaGVraW5hdiIsImEiOiJjbTM3Y3EwODUwN2NjMmxyMXNlNXAybDFoIn0.VP3wmKBE40PRLC1l1rBJBQ';
const map = new mapboxgl.Map({
    container: 'map',
    center: [24.9375, 60.170833],
    zoom: 9,
    style: "./hsl-map-style/custom_style.json"
})
map.on("load", () => {
    map.on("click", (e) => {
        let html = ""
        const popup = new mapboxgl.Popup({ closeOnClick: true })
            .setLngLat(e.lngLat)
            .addTo(map);
        getLineData(e, text => {
            html += text
            popup.setHTML(html)
        })
    })
})

const RAIL_ROUTE_ID_REGEXP = /^300[12]/
const SUBWAY_ROUTE_ID_REGEXP = /^31/



function isNumberVariant(routeId) {
    return /.{5}[0-9]/.test(routeId)
}


function isRailRoute(routeId) {
    return RAIL_ROUTE_ID_REGEXP.test(routeId)
}

function isSubwayRoute(routeId) {
    return SUBWAY_ROUTE_ID_REGEXP.test(routeId)
}


function trimRouteId(routeId) {
    if (isRailRoute(routeId) && isNumberVariant(routeId)) {
        return routeId.substring(1, 5).replace(RAIL_ROUTE_ID_REGEXP, "")
    } else if (isRailRoute(routeId)) {
        return routeId.replace(RAIL_ROUTE_ID_REGEXP, "")
    } else if (isSubwayRoute(routeId) && isNumberVariant(routeId)) {
        return routeId.substring(1, 5).replace(SUBWAY_ROUTE_ID_REGEXP, "")
    } else if (isSubwayRoute(routeId)) {
        return routeId.replace(SUBWAY_ROUTE_ID_REGEXP, "")
    } else if (isNumberVariant(routeId)) {
        // Do not show number variants
        return routeId.substring(1, 5).replace(/^[0]+/g, "")
    }
    return routeId.substring(1).replace(/^[0]+/g, "")
}


async function getLineData(e, text) {
    const { x, y } = e.point
    const { lng, lat } = e.lngLat
    const tolerance = 20
    const bbox = [
        [x - tolerance, y - tolerance],
        [x + tolerance, y + tolerance]
    ];

    //text("<h2>Stops:</h2>")

    // Find features intersecting the bounding box.
    const selectedRoutes = map.queryRenderedFeatures(bbox, {
        layers: ['route_bus', 'route_tram', 'route_trunk', 'route_lrail', 'route_ferry', 'route_subway', 'route_rail']
    });
    const selectedStops = map.queryRenderedFeatures(bbox, {
        layers: ['stops_case', 'stops_rail_case']
    });
    const stopsData = await Promise.all(selectedStops.map(async stop => (await fetch("https://kartat.hsl.fi/jore/graphql", {
        method: "POST",
        body: JSON.stringify(stopQuery({ ...stop.properties, date: new Date().toISOString().split("T")[0] })),
        headers: {
            "Content-Type": "application/json"
        }
    })).json()))
    for (let i = 0; i < stopsData.length; i++) {
        const stop = selectedStops[i].properties;
        const { data, errors } = stopsData[i]
        if (errors) {
            console.error(errors[0])
            continue
        }
        let routeText = ""
        const ids = new Set();
        const routes = data.data.routes.nodes.map(r => trimRouteId(r.routeId)).filter(route => !ids.has(route) && ids.add(route));
        routes.forEach(route => {
            routeText += ` ${route}`
        });
        text(`
<span class="popup-row">
    <span class="popup-icon">
        <a target="_blank" href="https://reittiopas.hsl.fi/pysakit/HSL%3A${stop.stopId}/aikataulu">
            <img src="img/favicon.svg">
        </a>
    </span>&nbsp
    <span class="popup-stop ${stopType(stop).toLowerCase()}-text">${stop.shortId}</span>&nbsp
    <span>${stop.nameFi}</span>&nbsp
    <span>${routeText}</span>
</span>`)
    }
    //text("<h2>Routes:</h2>")
    const ids = new Set();
    const filteredRoutes = selectedRoutes/* .filter(({ properties }) => !ids.has(properties.routeIdParsed) && ids.add(properties.routeIdParsed)); */
    const routesData = await Promise.all(filteredRoutes.map(async route => (await fetch("https://kartat.hsl.fi/jore/graphql", {
        method: "POST",
        body: JSON.stringify(routeQuery(route.properties)),
        headers: {
            "Content-Type": "application/json"
        }
    })).json()))
    for (let i = 0; i < routesData.length; i++) {
        const route = filteredRoutes[i].properties;
        const { data, errors } = await routesData[i]
        if (errors) {
            console.error(errors[0])
            continue
        }
        const line = data.data.line.nodes[0]
        text(`
<span class="popup-row">
    <span class="popup-icon">
        <a target="_blank" href="https://kartat.hsl.fi/kuljettaja/map/?${line.lineId}[dateBegin]=${line.dateBegin}&${line.lineId}[dateEnd]=${line.dateEnd}">
            <img src="img/driver_instructions.svg">
        </a>
    </span>&nbsp
    <span class="popup-route ${routeType(route).toLowerCase()}"><span>${route.routeIdParsed}</span></span>&nbsp
    <span>${data.data.originFi} -> ${data.data.destinationFi}</span>
</span>`
)
    }
}
function routeType(route) {
    return route.mode == "BUS" ? (route.trunk_route != "0" ? "TRUNK_BUS" : "BUS") : route.mode
}
function stopType(stop) {
    return stop.mode == "BUS" ? (stop.isTrunkStop ? "TRUNK_BUS" : "BUS") : stop.mode
}
const stopQuery = (vars) => ({
    queryName: "StopQuery",
    query: "\n  query StopQuery($stopId:String!, $date: Date!) {\n    data: stopByStopId(\n      stopId: $stopId\n    ) {\n      routes: routeSegmentsForDate(date: $date){\n        nodes {\n          routeId\n          dateBegin\n          dateEnd\n        }\n      }\n    }\n  }",
    variables: vars ? vars : {
        stopId: "2241201",
        shortId: "E 2401",
        nameFi: "Seilimäki",
        nameSe: "Söilibacka",
        mode: "BUS",
        isTrunkStop: false,
        date: "2025-08-30"
    }
})
const routeQuery = (vars) => ({
    queryName: "RouteQuery",
    query: "\n  query RouteQuery($direction:String!, $routeId: String!, $dateBegin: Date!, $dateEnd: Date!) {\n    data: routeByRouteIdAndDirectionAndDateBeginAndDateEnd(\n      routeId: $routeId,\n      direction: $direction,\n      dateBegin: $dateBegin,\n      dateEnd: $dateEnd\n    ) {\n      destinationFi\n      originFi\n      line {\n        nodes {\n          lineId\n          dateBegin\n          dateEnd\n        }\n      }\n    }\n  }",
    variables: vars ? vars : {
        direction: "1",
        routeId: "2114",
        routeIdParsed: "114",
        dateBegin: "2025-08-25",
        dateEnd: "2025-12-31",
        mode: "BUS",
        trunk_route: "0",
        hasRegularDayDepartures: true,
    }
})
