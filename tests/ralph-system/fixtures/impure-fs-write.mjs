import fs from "node:fs";

fs.writeFileSync(`${import.meta.filename}.unexpected`, "forbidden");
