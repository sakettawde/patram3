import { Hono } from "hono";
import { cors } from "hono/cors";
import users from "./routes/users";
import assistant from "./routes/assistant";

type Env = { Bindings: CloudflareBindings };

const app = new Hono<Env>();

app.use("*", cors({ origin: ["http://localhost:3000"], credentials: false }));

app.get("/", (c) => c.text("patram3-be"));
app.route("/users", users);
app.route("/assistant", assistant);

export default app;
