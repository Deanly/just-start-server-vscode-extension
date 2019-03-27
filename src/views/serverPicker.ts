import * as vscode from 'vscode';
import { QuickPickItem, window, Disposable, CancellationToken, QuickInputButton, QuickInput, ExtensionContext, QuickInputButtons } from 'vscode';
import { AppTypes, validateExecutableApplication } from '../core/application';


interface AppPickItem extends QuickPickItem {
    label: string;
    type: AppTypes;
    version?: string;
    download?: string;
    sourcePath?: string;
}

const applicationTypes: AppPickItem[] = [
    { label: 'Tomcat', type: AppTypes.TOMCAT },
    { label: 'Spring Boot', type: AppTypes.SPRING_BOOT },
];

const applicationSources: AppPickItem[] = [
    { label: 'Manually selecting a server folder...', type: AppTypes.TOMCAT },
    { label: 'Manually selecting a server folder...', type: AppTypes.SPRING_BOOT },
    { label: 'Tomcat-0.0.0', version: '0.0.0-alpha', type: AppTypes.TOMCAT, download: 'http://' }
];

/**
 * A multi-step input using window.createQuickPick() and window.createInputBox().
 * 
 * This first part uses the helper class `MultiStepInput` that wraps the API for the multi-step case.
 */
export async function multiStepInput(context: ExtensionContext) {

    interface State {
        title: string;
        step: number;
        totalSteps: number;
        name: string;
        selectedAppType: AppPickItem;
        selectedAppSource: AppPickItem;
        valid: boolean;
    }

	async function collectInputs () {
		const state = {} as Partial<State>;
		await MultiStepInput.run(input => pickApplicationType(input, state));
		return state as State;
	}

	const title = 'Select Application Service';

    async function pickApplicationType(input: MultiStepInput, state: Partial<State>) {
        state.selectedAppType = await input.showQuickPick<AppPickItem, QuickPickParameters<AppPickItem>>({
            title,
            step: 1,
            totalSteps: 3,
            placeholder: 'Pick a application server type',
            items: applicationTypes,
            shouldResume: shouldResume
        });

        state.name = state.selectedAppType.label;
        return (input: MultiStepInput) => pickApplicationSource(input, state);
    }
    
    async function pickApplicationSource (input: MultiStepInput, state: Partial<State>) {
        const sources = await getAvailableSources(state.selectedAppType!.type, undefined /* TODO: token */);
        state.selectedAppSource = await input.showQuickPick<AppPickItem, QuickPickParameters<AppPickItem>>({
			title,
            step: 2,
			totalSteps: 3,
			items: sources,
			activeItem: state.selectedAppSource,
            placeholder: 'Pick a application source',
            shouldResume
        });

        state.name = state.selectedAppSource.version ? `${state.name} (${state.selectedAppSource.version})` : state.name;

        if (state.selectedAppSource.download) {
            return (input: MultiStepInput) => downloadSource(input, state);
        } else {
            return (input: MultiStepInput) => lookForSourcePath(input, state);
        }

    }

    async function lookForSourcePath (input: MultiStepInput, state: Partial<State>) {
        const option: vscode.OpenDialogOptions = { canSelectFolders: true, canSelectFiles: false, canSelectMany: false, openLabel: 'Select Folder' };
        const uri = await vscode.window.showOpenDialog(option);

        if (!uri || uri.length === 0) { 
            vscode.window.showErrorMessage('No Selected');
            return;
        }

		state.valid = await validateExecutableApplication(state.selectedAppSource!.type, uri[0].path);
		state.selectedAppSource!.sourcePath = uri[0].path;
    }

    async function downloadSource (input: MultiStepInput, state: Partial<State>) {
        // TODO(dean): 3/3 Progress bar
        vscode.window.showInformationMessage(`Download.. '${state.name}'`);

        // ...download...
        // ...unpress...
        // ...prepare temp path...
        const path = '';

        if (await validateExecutableApplication(state.selectedAppSource!.type, path, state.selectedAppSource!.version)) {
            state.valid = true;
            state.selectedAppSource!.sourcePath = path;
        } else {
            state.valid = false;
        }
        await new Promise(resolve => setTimeout(resolve, 5000));
    }

	// async function inputResourceGroupName(input: MultiStepInput, state: Partial<State>) {
	// 	state.resourceGroup = await input.showInputBox({
	// 		title,
	// 		step: 2,
	// 		totalSteps: 4,
	// 		value: typeof state.resourceGroup === 'string' ? state.resourceGroup : '',
	// 		prompt: 'Choose a unique name for the resource group',
	// 		validate: validateNameIsUnique,
	// 		shouldResume: shouldResume
	// 	});
	// 	return (input: MultiStepInput) => inputName(input, state);
	// }

	// async function inputName(input: MultiStepInput, state: Partial<State>) {
	// 	const additionalSteps = typeof state.resourceGroup === 'string' ? 1 : 0;
	// 	// TODO: Remember current value when navigating back.
	// 	state.name = await input.showInputBox({
	// 		title,
	// 		step: 2 + additionalSteps,
	// 		totalSteps: 3 + additionalSteps,
	// 		value: state.name || '',
	// 		prompt: 'Choose a unique name for the Application Service',
	// 		validate: validateNameIsUnique,
	// 		shouldResume: shouldResume
	// 	});
	// 	return (input: MultiStepInput) => pickRuntime(input, state);
	// }

	function shouldResume() {
		// Could show a notification with the option to resume.
		return new Promise<boolean>((resolve, reject) => {
			vscode.window.showErrorMessage('Canceled');
			reject('Canceled');
		});
	}

	// async function validateNameIsUnique(name: string) {
	// 	// ...validate...
	// 	await new Promise(resolve => setTimeout(resolve, 1000));
	// 	return name === 'vscode' ? 'Name not unique' : undefined;
	// }

	async function getAvailableSources(type: AppTypes, token?: CancellationToken): Promise<AppPickItem[]> {
        await new Promise(resolve => setTimeout(resolve, 1000));
		return applicationSources.filter(pick => pick.type === type);
	}

	return await collectInputs();
}


// -------------------------------------------------------
// Helper code that wraps the API for the multi-step case.
// -------------------------------------------------------


class InputFlowAction {
	private constructor() { }
	static back = new InputFlowAction();
	static cancel = new InputFlowAction();
	static resume = new InputFlowAction();
}

type InputStep = (input: MultiStepInput) => Thenable<InputStep | void>;

interface QuickPickParameters<T extends QuickPickItem> {
	title: string;
	step: number;
	totalSteps: number;
	items: T[];
	activeItem?: T;
	placeholder: string;
	buttons?: QuickInputButton[];
	shouldResume: () => Thenable<boolean>;
}

interface InputBoxParameters {
	title: string;
	step: number;
	totalSteps: number;
	value: string;
	prompt: string;
	validate: (value: string) => Promise<string | undefined>;
	buttons?: QuickInputButton[];
	shouldResume: () => Thenable<boolean>;
}

class MultiStepInput {

	static async run<T>(start: InputStep) {
		const input = new MultiStepInput();
		return input.stepThrough(start);
	}

	private current?: QuickInput;
	private steps: InputStep[] = [];

	private async stepThrough<T>(start: InputStep) {
		let step: InputStep | void = start;
		while (step) {
			this.steps.push(step);
			if (this.current) {
				this.current.enabled = false;
				this.current.busy = true;
			}
			try {
				step = await step(this);
			} catch (err) {
				if (err === InputFlowAction.back) {
					this.steps.pop();
					step = this.steps.pop();
				} else if (err === InputFlowAction.resume) {
					step = this.steps.pop();
				} else if (err === InputFlowAction.cancel) {
					step = undefined;
				} else {
					throw err;
				}
			}
		}
		if (this.current) {
			this.current.dispose();
		}
	}

	async showQuickPick<T extends QuickPickItem, P extends QuickPickParameters<T>>({ title, step, totalSteps, items, activeItem, placeholder, buttons, shouldResume }: P) {
		const disposables: Disposable[] = [];
		try {
			return await new Promise<T | (P extends { buttons: (infer I)[] } ? I : never)>((resolve, reject) => {
				const input = window.createQuickPick<T>();
				input.title = title;
				input.step = step;
				input.totalSteps = totalSteps;
				input.placeholder = placeholder;
				input.items = items;
				if (activeItem) {
					input.activeItems = [activeItem];
				}
				input.buttons = [
					...(this.steps.length > 1 ? [QuickInputButtons.Back] : []),
					...(buttons || [])
				];
				disposables.push(
					input.onDidTriggerButton(item => {
						if (item === QuickInputButtons.Back) {
							reject(InputFlowAction.back);
						} else {
							resolve(<any>item);
						}
					}),
					input.onDidChangeSelection(items => resolve(items[0])),
					input.onDidHide(() => {
						(async () => {
							reject(shouldResume && await shouldResume() ? InputFlowAction.resume : InputFlowAction.cancel);
						})()
							.catch(reject);
					})
				);
				if (this.current) {
					this.current.dispose();
				}
				this.current = input;
				setTimeout(() => input.show(), 400);
			});
		} finally {
			disposables.forEach(d => d.dispose());
		}
	}

	async showInputBox<P extends InputBoxParameters>({ title, step, totalSteps, value, prompt, validate, buttons, shouldResume }: P) {
		const disposables: Disposable[] = [];
		try {
			return await new Promise<string | (P extends { buttons: (infer I)[] } ? I : never)>((resolve, reject) => {
				const input = window.createInputBox();
				input.title = title;
				input.step = step;
				input.totalSteps = totalSteps;
				input.value = value || '';
				input.prompt = prompt;
				input.buttons = [
					...(this.steps.length > 1 ? [QuickInputButtons.Back] : []),
					...(buttons || [])
				];
				let validating = validate('');
				disposables.push(
					input.onDidTriggerButton(item => {
						if (item === QuickInputButtons.Back) {
							reject(InputFlowAction.back);
						} else {
							resolve(<any>item);
						}
					}),
					input.onDidAccept(async () => {
						const value = input.value;
						input.enabled = false;
						input.busy = true;
						if (!(await validate(value))) {
							resolve(value);
						}
						input.enabled = true;
						input.busy = false;
					}),
					input.onDidChangeValue(async text => {
						const current = validate(text);
						validating = current;
						const validationMessage = await current;
						if (current === validating) {
							input.validationMessage = validationMessage;
						}
					}),
					input.onDidHide(() => {
						(async () => {
							reject(shouldResume && await shouldResume() ? InputFlowAction.resume : InputFlowAction.cancel);
						})()
							.catch(reject);
					})
				);
				if (this.current) {
					this.current.dispose();
				}
				this.current = input;
				this.current.show();
			});
		} finally {
			disposables.forEach(d => d.dispose());
		}
	}
}