import * as fs from "node:fs";
import Handlebars from "handlebars";
import { parse } from 'node-html-parser';

const webroot = "./src";

function uuidv4() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = Math.random() * 16 | 0, v = (c == 'x') ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

export class Redirect {

    url = "";

    constructor(url) {
        if (typeof url !== "string") return;
        this.url = url;
    }

}

/**
 * @type {Map<string, { template : (prop:any) => string, js : (request:any) => any }>}
 */
const cachePages = new Map();

/**
 * @param {import("fastify").FastifyInstance} fastify 
 * @param {boolean} useCaching
 */
export function templateEngine(fastify, useCaching = true) {

    fastify.addHook("onRequest", function(request, reply, done) {

        const path = request.originalUrl.split("?")[0];
        const srcPath = `${webroot}${path}${path.charAt(path.length - 1) === "/" ? "index.html" : ""}`;
        const page = cachePages.get(srcPath);

        if (page && useCaching) {

            const data = page.js(request);
            if (data instanceof Redirect) {
                reply.redirect(data.url)
                done();
                return;
            }

            reply.header("content-type", "text/html; charset=utf-8").send(page.template(data))
            done();
            return;
        }
        
        fs.readFile(srcPath, "UTF-8", function(error, data) {
            if (error) {
                reply.code(500).send("X Server Internal Error");
                done();
                return;
            }

            let html;
            let jsArray = [];
            
            try {
                html = parse(data);
                jsArray = html.querySelectorAll("script[use=\"server\"]");
            } catch (error) {
                reply.code(500).send(error.toString());
                done();
                return;
            }

            if (jsArray.length <= 0) {
                const rawHtml = html.toString();
                const page = { template : () => rawHtml, js : () => ({}) };
                if (useCaching) cachePages.set(srcPath, page);
                reply.header("content-type", "text/html; charset=utf-8").send(page.template());
                return;
            }

            for (let i = 0; i < jsArray.length; i++) {
                html.removeChild(jsArray[i]);
            }

            const jsRaw = jsArray[0];
            const jsTmpFilename = uuidv4();

            fs.writeFile(`./${jsTmpFilename}.js`, jsRaw.innerHTML, {}, function(error) {
                if (error) {
                    reply.code(500).send("Error, Failed to write server js tmp");
                    done();
                    return;
                }

                import(`../${jsTmpFilename}.js`).then((js) => {
                    fs.unlink(`./${jsTmpFilename}.js`, function(error) {
                        if (error) {
                            console.error(error.toString());
                            reply.code(500).send("Error, Failed to remove js tmp");
                            done();
                            return;
                        }

                        const template = Handlebars.compile(html.toString());
                        const page = { template, js : js.default };
                        if (useCaching) cachePages.set(srcPath, page);

                        const data = page.js(request);
                        if (data instanceof Redirect) {
                            reply.redirect(data.url)
                            done();
                            return;
                        }
                        
                        reply.header("content-type", "text/html; charset=utf-8").send(template(data))
                        done();
                    })
                }).catch((error) => {
                    console.error(error.toString());
                    reply.code(500).send("Error, Failed to import js tmp");
                    done();
                })
            }); 
        })
    })
}