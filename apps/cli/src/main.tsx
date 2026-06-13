import React from "react";
import { render } from "ink";
import App from "./app.js";

const args = process.argv.slice(2);
const memoryEnabled = args.includes("--memory");
const resumeMode = args.includes("--resume");
const continueMode = args.includes("--continue");

render(<App memoryEnabled={memoryEnabled} resumeMode={resumeMode} continueMode={continueMode} />);
