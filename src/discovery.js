import { readJsonFile, writeJsonFile } from "./json-file.js";
import { collectObjects } from "./tree-search.js";

function isOrderObject(value) {
  return Boolean(
    value &&
      typeof value === "object" &&
      typeof value.DateAndHour === "string" &&
      (value.Employye || value.Treatment || value.User)
  );
}

function isTemplateObject(value) {
  return Boolean(
    value &&
      typeof value === "object" &&
      value.Employye &&
      typeof value.Employye === "object" &&
      value.Treatment &&
      typeof value.Treatment === "object"
  );
}

function isUserObject(value, userId = "") {
  return Boolean(
    value &&
      typeof value === "object" &&
      typeof value._id === "string" &&
      typeof value.FName === "string" &&
      (userId ? value._id === userId : true)
  );
}

function flattenCatalog(catalog) {
  const templates = [];

  if (!catalog || typeof catalog !== "object") {
    return templates;
  }

  for (const property of Object.values(catalog)) {
    if (!Array.isArray(property)) {
      continue;
    }

    for (const item of property) {
      if (isTemplateObject(item)) {
        templates.push(item);
      }
    }
  }

  return templates;
}

function normalizeOrder(order) {
  return order.obj && isOrderObject(order.obj) ? order.obj : order;
}

function extractOrders(payload) {
  if (Array.isArray(payload)) {
    return payload.map(normalizeOrder).filter(isOrderObject);
  }

  return collectObjects(payload, isOrderObject);
}

function normalizeUserProfile(value) {
  if (!value || typeof value !== "object") {
    return null;
  }

  if (isUserObject(value)) {
    return value;
  }

  if (isUserObject(value.User)) {
    return value.User;
  }

  return null;
}

function buildTemplatesFromOrderSteps(orderSteps) {
  const branchMap = orderSteps?.BranchAndManWomen ?? {};
  const employees = Array.isArray(orderSteps?.employye) ? orderSteps.employye : [];
  const templates = [];

  for (const employee of employees) {
    if (!employee || typeof employee !== "object" || !Array.isArray(employee.ListTreatments)) {
      continue;
    }

    const branch = branchMap[employee.Branch] ?? { Name: employee.Branch };

    for (const treatment of employee.ListTreatments) {
      if (!treatment || typeof treatment !== "object") {
        continue;
      }

      templates.push({
        Branch: branch,
        ManWomen: employee.ManWomen,
        Employye: employee,
        Treatment: treatment
      });
    }
  }

  return templates;
}

function selectTemplate(templates, config) {
  return templates.find((template) => {
    const employee = template.Employye;
    const treatment = template.Treatment;
    const employeeMatchesById = config.targetEmployeeId && employee._id === config.targetEmployeeId;
    const employeeMatchesByName = employee.Name === config.targetEmployeeName;
    const treatmentMatchesById = config.targetTreatmentId && treatment._id === config.targetTreatmentId;
    const treatmentMatchesByName = treatment.Name === config.targetTreatmentName;

    const employeeMatches = employeeMatchesById || employeeMatchesByName;
    const treatmentMatches = config.targetTreatmentId ? treatmentMatchesById : treatmentMatchesByName;

    return employeeMatches && treatmentMatches;
  });
}

function summarizeTemplate(template) {
  return {
    employeeName: template.Employye?.Name,
    employeeId: template.Employye?._id,
    treatmentName: template.Treatment?.Name,
    treatmentId: template.Treatment?._id,
    daysOrPicker: template.Employye?.DaysOrPicker,
    timeToOrder: template.Employye?.TimeToOrder
  };
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function average(numbers) {
  if (numbers.length === 0) {
    return null;
  }

  return Number((numbers.reduce((sum, value) => sum + value, 0) / numbers.length).toFixed(2));
}

function inferEmployeeRole(employee, templates, comments) {
  const treatmentNames = templates.map((template) => template.Treatment?.Name ?? "");
  const commentText = comments
    .map((comment) => comment.Comment ?? "")
    .join(" ");

  if (employee.Name.includes("\u05d0\u05e7\u05d3\u05de\u05d9\u05d4")) {
    return "academy-team";
  }

  if (
    treatmentNames.some((name) => name.includes("\u05ea\u05e1\u05e4\u05d5\u05e8\u05ea") || name.includes("\u05d6\u05e7\u05df")) ||
    commentText.includes("\u05e1\u05e4\u05e8") ||
    commentText.includes("\u05ea\u05e1\u05e4\u05d5\u05e8\u05ea")
  ) {
    return "barber";
  }

  if (commentText.includes("\u05dc\u05d9\u05d9\u05d6\u05e8")) {
    return "laser-or-beauty";
  }

  return "unknown";
}

function buildEmployeeRoster(employeesMetadata, treatmentCatalog) {
  const employees = employeesMetadata?._Employyes ?? [];
  const comments = employeesMetadata?._Comments ?? [];
  const templates = flattenCatalog(treatmentCatalog);
  const currentEmployeeIds = new Set(employees.map((employee) => employee._id));

  const roster = employees.map((employee) => {
    const employeeTemplates = templates.filter((template) => template.Employye?._id === employee._id);
    const employeeComments = comments.filter((comment) => comment.Employye === employee._id);
    const newestCommentWithText = employeeComments
      .filter((comment) => (comment.Comment ?? "").trim())
      .sort((left, right) => new Date(right.SendOn).getTime() - new Date(left.SendOn).getTime())[0];

    return {
      name: employee.Name,
      id: employee._id,
      active: employee.Active,
      branch: employee.Branch,
      publicBookable: employeeTemplates.length > 0,
      publicTreatments: unique(employeeTemplates.map((template) => template.Treatment?.Name)),
      categories: unique(employeeTemplates.flatMap((template) => template.Employye?.Categories ?? [])),
      reviewCount: employeeComments.length,
      averageRating: average(employeeComments.map((comment) => comment.Rating).filter(Number.isFinite)),
      inferredRole: inferEmployeeRole(employee, employeeTemplates, employeeComments),
      sampleComment: newestCommentWithText?.Comment ?? null,
      instagram: employee.InstaLink || null
    };
  });

  const historicalEmployeesFromComments = unique(
    comments
      .map((comment) => comment.Employye)
      .filter((employeeId) => employeeId && !currentEmployeeIds.has(employeeId))
  ).map((employeeId) => {
    const employeeComments = comments.filter((comment) => comment.Employye === employeeId);
    return {
      id: employeeId,
      reviewCount: employeeComments.length,
      averageRating: average(employeeComments.map((comment) => comment.Rating).filter(Number.isFinite))
    };
  });

  return {
    roster,
    historicalEmployeesFromComments
  };
}

export async function resolveDiscovery({ client, config, logger }) {
  const discovery = {
    fetchedAt: new Date().toISOString(),
    uniqeabc: config.uniqeabc,
    publicEmployees: [],
    publicTemplates: [],
    employeeRoster: [],
    barberRoster: [],
    historicalEmployeesFromComments: [],
    targetEmployeeProfile: null,
    targetFoundPublicly: false,
    targetTemplateSummary: null,
    blockers: [],
    notes: []
  };

  let employeesMetadata = null;
  let treatmentCatalog = null;
  let futureOrders = null;
  let orderSteps = null;
  let businessDetails = null;
  const userProfileFromFile = normalizeUserProfile(await readJsonFile(config.userProfileFile, null));
  let userProfile = userProfileFromFile;
  const resolvedUserId = config.userId || userProfileFromFile?._id || "";

  try {
    businessDetails = await client.getBusinessDetails();
  } catch (error) {
    logger.warn("Failed to fetch public business details.", { error: error.message });
    discovery.notes.push("Could not fetch public business details.");
  }

  try {
    employeesMetadata = await client.getEmployeesMetadata();
    discovery.publicEmployees = (employeesMetadata?._Employyes ?? []).map((employee) => ({
      name: employee.Name,
      id: employee._id,
      active: employee.Active
    }));
  } catch (error) {
    logger.warn("Failed to fetch public employees metadata.", { error: error.message });
    discovery.blockers.push("Could not read the public employees metadata.");
  }

  try {
    treatmentCatalog = await client.getTreatmentCatalog();
    discovery.publicTemplates = flattenCatalog(treatmentCatalog).map(summarizeTemplate);
  } catch (error) {
    logger.warn("Failed to fetch public treatment catalog.", { error: error.message });
    discovery.blockers.push("Could not read the public treatment catalog.");
  }

  try {
    orderSteps = await client.getTablesOrder(resolvedUserId);
  } catch (error) {
    logger.warn("Failed to fetch order steps.", { error: error.message });
    discovery.notes.push("getTablesOrder did not return usable data for the current session.");
  }

  if (resolvedUserId) {
    try {
      futureOrders = await client.getFutureOrdersById(resolvedUserId);
    } catch (error) {
      logger.warn("Failed to fetch future orders.", { error: error.message });
      discovery.notes.push("Future orders could not be loaded for the resolved user.");
    }
  } else {
    discovery.notes.push("EZTOR_USER_ID is not set yet and no user profile file supplied an _id.");
  }

  const publicTemplates = flattenCatalog(treatmentCatalog);
  const privateTemplates = buildTemplatesFromOrderSteps(orderSteps);
  const orders = extractOrders(futureOrders);
  const orderTemplates = orders
    .filter((order) => order?.Employye && order?.Treatment)
    .map((order) => ({
      Branch: order.Branch,
      ManWomen: order.ManWomen,
      Employye: order.Employye,
      Treatment: order.Treatment
    }));
  const allTemplates = [...privateTemplates, ...orderTemplates, ...publicTemplates];
  const employeeRosterData = buildEmployeeRoster(employeesMetadata, treatmentCatalog);
  const targetEmployeeProfile =
    employeeRosterData.roster.find((employee) => employee.name === config.targetEmployeeName) ?? null;

  discovery.employeeRoster = employeeRosterData.roster;
  discovery.barberRoster = employeeRosterData.roster.filter((employee) => employee.inferredRole === "barber");
  discovery.historicalEmployeesFromComments = employeeRosterData.historicalEmployeesFromComments;
  discovery.targetEmployeeProfile = targetEmployeeProfile;

  const selectedTemplate = selectTemplate(allTemplates, config);

  if (selectedTemplate) {
    discovery.targetFoundPublicly = publicTemplates.includes(selectedTemplate);
    discovery.targetTemplateSummary = summarizeTemplate(selectedTemplate);
  } else {
    if (targetEmployeeProfile && !targetEmployeeProfile.publicBookable) {
      discovery.blockers.push(
        `${config.targetEmployeeName} exists in the app roster but is not currently bookable in the public catalog, so a private order template is still required.`
      );
      discovery.notes.push(
        `${config.targetEmployeeName} is still recognized as an active barber in the app metadata. The missing public template likely means there are no open slots for that employee right now.`
      );
    } else {
      discovery.blockers.push(
        `Could not find a matching order template for ${config.targetEmployeeName} / ${config.targetTreatmentName}.`
      );
    }
  }

  if (!userProfile && orderSteps) {
    userProfile = collectObjects(orderSteps, (value) => isUserObject(value, resolvedUserId))[0] ?? null;
  }

  if (!userProfile && futureOrders) {
    const users = collectObjects(futureOrders, (value) => isUserObject(value, resolvedUserId));
    userProfile = users[0] ?? null;
  }

  const orderTemplateFromFile = await readJsonFile(config.orderTemplateFile, null);
  const orderTemplate = orderTemplateFromFile ?? selectedTemplate ?? null;

  await writeJsonFile(config.discoveryFile, {
    ...discovery,
    businessName: businessDetails?.BusinessNameHeb ?? businessDetails?.BusinessNameEng ?? null,
    resolvedUserId,
    ordersCount: orders.length,
    orderTemplateLoadedFromFile: Boolean(orderTemplateFromFile),
    userProfileLoadedFromFile: Boolean(userProfileFromFile),
    availablePublicEmployeeNames: discovery.publicEmployees.map((employee) => employee.name)
  });

  return {
    discovery,
    businessDetails,
    employeesMetadata,
    treatmentCatalog,
    futureOrders,
    orderSteps,
    orders,
    orderTemplate,
    userProfile,
    resolvedUserId
  };
}
