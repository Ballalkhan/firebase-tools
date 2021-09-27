import * as path from "path";
import * as semver from "semver";

import { FirebaseError } from "../../error";
import * as extensionsApi from "../../extensions/extensionsApi";
import * as refs from "../../extensions/refs";
import { readEnvFile } from "../../extensions/paramHelper";

export interface Deployable {
  instanceId: string;
  ref?: refs.Ref;
  params: Record<string, string>;
}

const ENV_DIRECTORY = "extensions";

export async function have(projectId: string): Promise<Deployable[]> {
  const instances = await extensionsApi.listInstances(projectId);
  return instances.map((i) => {
    const dep: Deployable = {
      instanceId: i.name.split("/").pop()!,
      params: i.config.params,
    };
    if (i.config.extensionRef) {
      const ref = refs.parse(i.config.extensionRef);
      dep.ref = ref;
      dep.ref.version = i.config.extensionVersion;
    }
    return dep;
  });
}

export async function want(
  extensions: Record<string, string>,
  projectDir: string
): Promise<Deployable[]> {
  const deployables: Deployable[] = [];
  const errors: FirebaseError[] = [];
  for (const e of Object.entries(extensions)) {
    try {
      const instanceId = e[0];
      const ref = refs.parse(e[1]);
      ref.version = await resolveVersion(ref);
      const params = readParams(projectDir, instanceId);
      deployables.push({
        instanceId,
        ref,
        params,
      });
    } catch (err) {
      console.log(e, err);
      errors.push(err as FirebaseError);
    }
  }
  if (errors.length) {
    const messages = errors.map((e) => e.message).join("\n");
    throw new FirebaseError(`Errors while reading 'extensions' in 'firebase.json'\n${messages}`);
  }
  return deployables;
}

/**
 * resolveVersion resolves a semver string to the max matching version.
 * @param publisherId
 * @param extensionId
 * @param version a semver or semver range
 */
async function resolveVersion(ref: refs.Ref): Promise<string> {
  if (!ref.version || ref.version == "latest") {
    return "latest";
  }
  const extensionRef = refs.toExtensionRef(ref);
  const versions = await extensionsApi.listExtensionVersions(extensionRef);
  const maxSatisfying = semver.maxSatisfying(
    versions.map((ev) => ev.spec.version),
    ref.version
  );
  if (!maxSatisfying) {
    throw new FirebaseError(
      `No version of ${extensionRef} matches requested version ${ref.version}`
    );
  }
  return maxSatisfying;
}

function readParams(projectDir: string, instanceId: string): Record<string, string> {
  const paramPath = path.join(projectDir, ENV_DIRECTORY, `${instanceId}.env`);
  const params = readEnvFile(paramPath);
  return params as Record<string, string>;
}
