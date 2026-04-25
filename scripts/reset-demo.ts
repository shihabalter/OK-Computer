import "dotenv/config";

import { resetDemoEvents } from "../src/lib/db";

resetDemoEvents();
console.log("OK Computer dashboard events cleared. Chain state was not changed.");
