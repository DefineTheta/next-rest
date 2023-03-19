import StatusCodes from "http-status-codes"

export class ClientError extends Error {
	constructor(status, message) {
		super(message)
		this.status = status
	}
}

const optionalRestComponentPattern = /\[\[\.\.\.(.+)\]\]^$/
const restComponentPattern = /\[\.\.\.(.+)\]^$/
const componentPattern = /^\[(.+)\]$/
const queryComponentPattern = /^(\[*[A-Za-z]+\]*)\?\{([A-Za-z0-9]+(,[A-Za-z0-9]+)+)\}$/;

function parseURLComponent(component, params) {
	const path = [];

	if (optionalRestComponentPattern.test(component)) {
		const [{}, param] = restComponentPattern.exec(component)
		if (param in params) {
			const values = params[param]
			if (Array.isArray(values)) {
				for (const value of values) {
					path.push(encodeURIComponent(value))
				}
			} else {
				throw new Error(`Invalid URL rest parameter: ${param}`)
			}
		}
	} else if (restComponentPattern.test(component)) {
		const [{}, param] = restComponentPattern.exec(component)
		const values = params[param]
		if (Array.isArray(values)) {
			for (const value of values) {
				path.push(encodeURIComponent(value))
			}
		} else {
			throw new Error(`Invalid URL rest parameter: ${param}`)
		}
	} else if (componentPattern.test(component)) {
		const [{}, param] = componentPattern.exec(component)
		const value = params[param]
		if (typeof value === "string") {
			path.push(encodeURIComponent(value))
		} else {
			throw new Error(`Invalid URL parameter: ${param}`)
		}
	} else {
		path.push(encodeURIComponent(component))
	}

	return path.join("/");
}

function makeURL(route, params) {
	const path = []
	let queryPath = [];

	for (const component of route.split("/")) {		
		if (queryComponentPattern.test(component)) {
			const [{}, param, queryParams] = queryComponentPattern.exec(component);
			
			path.push(parseURLComponent(param, params));
			queryPath = queryParams.split(",").map((queryParam) => `${queryParam}=${encodeURIComponent(params[queryParam])}`);
		} else {
			path.push(parseURLComponent(component, params))
		}
	}

	return [path.join("/"), queryPath.join("&")].join("?");
}

function parseHeaders(headers) {
	const result = {}
	for (const [key, value] of headers) {
		result[key] = value
	}
	return result
}

async function clientFetch(method, route, params, headers, body) {
	const mode = "same-origin"
	const init = { method, mode, headers }
	if (body !== undefined) {
		init.body = JSON.stringify(body)
	}

	const url = makeURL(route, params)
	const res = await fetch(process.env.API_URL || '' + url, init)
	if (
		res.status !== StatusCodes.OK &&
		res.status !== StatusCodes.NOT_MODIFIED
	) {
		throw new ClientError(res.status, await res.text())
	}

	const responseHeaders = parseHeaders(res.headers)
	const contentType = res.headers.get("content-type")
	const mimeType = parseMimeType(contentType)
	if (mimeType === "application/json") {
		const responseBody = await res.json()
		return { headers: responseHeaders, body: responseBody }
	} else {
		return { headers: responseHeaders, body: undefined }
	}
}

function parseMimeType(contentType) {
	if (typeof contentType === "string") {
		const index = contentType.indexOf(";")
		if (index === -1) {
			return contentType
		} else {
			return contentType.slice(0, index)
		}
	} else {
		return null
	}
}

const makeMethod =
	(method) =>
	(route, { params, headers, body }) =>
		clientFetch(method, route, params, headers, body)

export default {
	get: makeMethod("GET"),
	put: makeMethod("PUT"),
	post: makeMethod("POST"),
	head: makeMethod("HEAD"),
	patch: makeMethod("PATCH"),
	delete: makeMethod("DELETE"),
}
