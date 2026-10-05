import { demo } from './main.twill';
import { demoWorkflow } from './workflow.twill';
console.log(JSON.stringify({ ...(await demo()), workflow: await demoWorkflow() }, null, 2));
