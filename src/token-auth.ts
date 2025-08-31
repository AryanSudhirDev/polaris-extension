import * as vscode from 'vscode';

export interface TokenValidationResponse {
  access: boolean;
  status?: 'trialing' | 'active' | 'inactive' | 'pro';
  user_email?: string;
  message?: string;
}

// Valid premium tokens (hardcoded for security)
const VALID_PREMIUM_TOKENS = new Set([
  'PROMPTR_PREMIUM_WPKmg1NPiyPL6ijE9nVBJ1xHb23mafnatop8hKAgxF4',
  'PROMPTR_PREMIUM_m9PsptMLoWK4Ls_VmLHzJ4Wc8A0M8TXOySPEdqdc_KE',
  'PROMPTR_PREMIUM_AL7yc1mI6cEkxmRMVchlT--_5d__6OHs2KDV1Sf92Yg',
  'PROMPTR_PREMIUM_VhcWcX0HAIZFohVJPZa7tJ6CBd78sX8gOqIOFPy4r0o',
  'PROMPTR_PREMIUM_vTM5gjEmgMX0Y0s3mRpCr-kvKws6JClLW1bhKbK6EU8',
  'PROMPTR_PREMIUM_NmNgSrUin-1pn0E39Tzgq9M13NSygJutkhtN7meiucE',
  'PROMPTR_PREMIUM_eFuGY9Z0wfZ37We6rCjswJ8gX3tEEyo2ws4AVUBUjjE',
  'PROMPTR_PREMIUM_GD0KgGXToXziENHtSejhmowb3zG1mOl2IXJcCtllfFI',
  'PROMPTR_PREMIUM_U_1oODvVdhhtkyUXeFj4X7CUtbDLpfnfZk7EvMWfJiI',
  'PROMPTR_PREMIUM_fw8gF5vB1rlqm4JY8l18wHQn-XbIAFGOa0ieM-_9W24',
  'PROMPTR_PREMIUM_Xf-FcQ3dqb7BXBT0bogR8M_oGfgBGZ7VyqPtObh_Ncg',
  'PROMPTR_PREMIUM_fqYZR8t19AWs6FaD8Sttf0yfiUCRjqka2vDTOEgbAtY',
  'PROMPTR_PREMIUM_1flPAp5-qgqrD709lpwkWnZVdSI_Udn5lQUHvvCqdGg',
  'PROMPTR_PREMIUM_Q1Ww6sYqEo56CehclfEgH2LWNQ4lCLgMifiAS04p9ms',
  'PROMPTR_PREMIUM_T6UW7anMYvmwyAMk8uAaqyUIEvz2MMIsc4q-AQdbo00',
  'PROMPTR_PREMIUM_22DOjgcaMrcsNA7o0L3II8L7KQlMqi3Cx6As7QSliT8',
  'PROMPTR_PREMIUM_8H9oOPSgdIQZLrXsxbaUVp40BAOORGEs6KUrprsGHOc',
  'PROMPTR_PREMIUM_3NkUD85OWxuK_zuzj0kTNrsPgTESgM_-GTOAIS4_iD8',
  'PROMPTR_PREMIUM_gn4gKEtwqzqfULZEH3vGgdYoHg-7mBj3-sMSoNxFFHM',
  'PROMPTR_PREMIUM_puPeS0Gr9pXTxjAjpvJE8lpCBAnkYkwF0akXZQnKPro',
  'PROMPTR_PREMIUM_6j33fde7JF6k-tZG_z4j1VN2wKXiIip4WSuWs6sNCV4',
  'PROMPTR_PREMIUM__6w-wsvPjHwtL7ECfRPsA6iq8wM-PXuznwlDonzD_DE',
  'PROMPTR_PREMIUM_67vOOO1hTIWEFzJVP2RBYHfrAODU4UEyjjda0b_ccZo',
  'PROMPTR_PREMIUM_IeeFxfdTQMD7YOnT-tL6L-osjwghwLvkzi1w60QUygc',
  'PROMPTR_PREMIUM_YNf8rN1NsQ7xE4WwI5iViLrpAzOqBRquUR8Uqk4wXGM',
  'PROMPTR_PREMIUM_pek4BsQ1pcs-ezXBre0gKv7OWJqjiHxch9-yO7qW1fk',
  'PROMPTR_PREMIUM_2ixU_x8dCuPuYS3xNwvk1U5rKRZkgu3oVL7A_WWT33o',
  'PROMPTR_PREMIUM_e6t0L4u3pos31UoCuCxgMqBIqTYTp_suThB1-PkPyKc',
  'PROMPTR_PREMIUM_Pvvt4gPZP6-56Z5v13XXhre9GkYaodW5-gxCRlsbeqI',
  'PROMPTR_PREMIUM_yMCKfUKPvFLoLXbjhsf3PZOjKm92BojDltacikXGEHc',
  'PROMPTR_PREMIUM_LkQ7eX9G2zS4pV8mT1aC6nR3yW0dH5uJ7bK2fM8oPiQ',
  'PROMPTR_PREMIUM_R9nV2pL7kT1cX6sY3mB8dF0aH5gJ2wQ4zU8iO1rNcE',
  'PROMPTR_PREMIUM_qW8zX3cV6bN1mT4pR7yL2kJ9hG0aF5dS8uO3iP1vMe',
  'PROMPTR_PREMIUM_Ab7Y2kQ9pL4nV1tX6cR3mF8dH0aG5jS2uW8iO1zPe',
  'PROMPTR_PREMIUM_Nx6C1vB7kL2mT9pR4yJ8aH0fG5dS3uW8iO1zQeV2n',
  'PROMPTR_PREMIUM_Ty9P2nL7kC1xV6sR3mB8fD0aH5gJ2wQ4zU8iO1rNe',
  'PROMPTR_PREMIUM_Gh5J2wQ4zU8iO1rN9vB2kL7mT1cX6sY3pF8dA0eHg',
  'PROMPTR_PREMIUM_Vm8T1aC6nR3yW0dH5uJ7bK2fM8oPqL4xZ9sE2iY7r',
  'PROMPTR_PREMIUM_Kb2fM8oPiQ7lW3xZ9sE2iY7rV6tN1cX4pR8yJ0dHg',
  'PROMPTR_PREMIUM_wQ4zU8iO1rNe9vB2kL7mT1cX6sY3pF8dA0eHg5J2',
  'PROMPTR_PREMIUM_2ixV7sY3mB8dF0aH5gJ2wQ4zU8iO1rN9vB2kL7mT',
  'PROMPTR_PREMIUM_M3tY9eF0aH6gK4WjS2uD8iC0lBp7qV1xN5zR8yL2',
  'PROMPTR_PREMIUM_P6xQdX2LwGZyK4UjW1rC8N0a5Q9vB2kL7mT1cX6s',
  'PROMPTR_PREMIUM_J0aH5gK4WjS2uD8iC0lBp7qV1xN5zR8yL2mT9pF3d',
  'PROMPTR_PREMIUM_Z9sE2iY7rV6tN1cX4pR8yJ0dHg5J2wQ4zU8iO1rN',
  'PROMPTR_PREMIUM_C6nR3yW0dH5uJ7bK2fM8oPiQ7lW3xZ9sE2iY7rV6',
  'PROMPTR_PREMIUM_oPqL4xZ9sE2iY7rV6tN1cX4pR8yJ0dHg5J2wQ4zU',
  'PROMPTR_PREMIUM_yW0dH5uJ7bK2fM8oPiQ7lW3xZ9sE2iY7rV6tN1cX',
  'PROMPTR_PREMIUM_bK2fM8oPiQ7lW3xZ9sE2iY7rV6tN1cX4pR8yJ0dH',
  'PROMPTR_PREMIUM_iC0lBp7qV1xN5zR8yL2mT9pF3dG6hJ4kW8sY2vU0',
  'PROMPTR_PREMIUM_S2uD8iC0lBp7qV1xN5zR8yL2mT9pF3dG6hJ4kW8s',
  'PROMPTR_PREMIUM_Q4zU8iO1rN9vB2kL7mT1cX6sY3pF8dA0eHg5J2w',
  'PROMPTR_PREMIUM_L2mT9pF3dG6hJ4kW8sY2vU0aC5nR7yT1xP9qV3b',
  'PROMPTR_PREMIUM_U1rN9vB2kL7mT1cX6sY3pF8dA0eHg5J2wQ4zU8i',
  'PROMPTR_PREMIUM_X6sY3pF8dA0eHg5J2wQ4zU8iO1rN9vB2kL7mT1c',
  'PROMPTR_PREMIUM_D0eHg5J2wQ4zU8iO1rN9vB2kL7mT1cX6sY3pF8dA',
  'PROMPTR_PREMIUM_R8yL2mT9pF3dG6hJ4kW8sY2vU0aC5nR7yT1xP9qV',
  'PROMPTR_PREMIUM_T1cX6sY3pF8dA0eHg5J2wQ4zU8iO1rN9vB2kL7mT',
  'PROMPTR_PREMIUM_V6tN1cX4pR8yJ0dHg5J2wQ4zU8iO1rN9vB2kL7mT',
  'PROMPTR_PREMIUM_H5uJ7bK2fM8oPiQ7lW3xZ9sE2iY7rV6tN1cX4pR8'
]);

/**
 * Validates a Promptr access token against the backend
 */
export async function validateAccessToken(token: string): Promise<TokenValidationResponse> {
  // Check for valid premium bypass tokens first
  if (VALID_PREMIUM_TOKENS.has(token)) {
    console.log('✅ Valid premium bypass token detected, granting unlimited access');
    return {
      access: true,
      status: 'pro',
      user_email: 'premium-user@promptr.com',
      message: 'Premium token validated successfully'
    };
  }
  
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
  
  if (!supabaseUrl || !supabaseAnonKey) {
    return {
      access: false,
      message: 'Supabase configuration missing'
    };
  }
  
  const endpoint = `${supabaseUrl}/functions/v1/validate-token`;
  
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': supabaseAnonKey,
        'Authorization': `Bearer ${supabaseAnonKey}`
      },
      body: JSON.stringify({ token })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Promptr API Error:', response.status, errorText);
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const json = await response.json();
    console.log('Promptr token-check response:', json);
    
    // Handle validate-token response format
    if (json.access) {
      // For free plan users, we want to show them as 'active' but with usage limits
      const status = json.status === 'trialing' ? 'active' : json.status;
      return {
        access: true,
        status: status,
        user_email: json.email || 'user@example.com',
        message: 'Token validated successfully'
      };
    } else {
      return {
        access: false,
        status: json.status || 'inactive',
        message: json.message || 'Invalid token'
      };
    }
  } catch (error: any) {
    console.error('Token validation failed:', error);
    return {
      access: false,
      message: `Validation error: ${error.message}`
    };
  }
}

/**
 * Check if user has valid Promptr access using stored or entered token
 */
export async function checkUserAccess(): Promise<boolean> {
  // First check if they have a token stored
  let token = await getStoredToken();
  
  if (!token) {
    // Show input box for token
    const inputToken = await vscode.window.showInputBox({
      prompt: 'Enter your Promptr access token',
      placeHolder: 'Get your token from https://usepromptr.com/account',
      password: true,
      ignoreFocusOut: true
    });
    
    if (!inputToken) {
      vscode.window.showErrorMessage('Please enter your Promptr access token to continue.');
      return false;
    }
    
    // Store the token for future use
    await storeToken(inputToken);
    token = inputToken;
  }

  // Validate the token
  if (!token) {
    return false;
  }
  
  const result = await validateAccessToken(token);
  
      console.log(`🔍 Token validation result: access=${result.access}, status=${result.status || 'unknown'}, message=${result.message || 'no message'}`);
  
  if (result.access) {
    console.log(`✅ Promptr access granted for ${result.user_email} (${result.status})`);
    
    // Show success message for first-time setup or status changes
    const lastStatus = await getLastKnownStatus();
    if (!lastStatus || lastStatus !== result.status) {
      vscode.window.showInformationMessage(
        `✨ Promptr ${result.status} subscription verified for ${result.user_email}`
      );
      await storeLastKnownStatus(result.status || 'unknown');
    }
    
    return true;
  } else {
    console.log(`❌ Promptr access denied: ${result.message}`);
    
    // Clear stored token if invalid
    await clearStoredToken();
    
    if (result.status === 'inactive') {
      const action = await vscode.window.showErrorMessage(
        'Your Promptr subscription is inactive. Please update your payment method to continue using the service.',
        'Open Billing',
        'Enter New Token'
      );
      
      if (action === 'Open Billing') {
        vscode.env.openExternal(vscode.Uri.parse('https://usepromptr.com/account'));
      } else if (action === 'Enter New Token') {
        return await checkUserAccess(); // Recursive call to re-enter token
      }
    } else {
      const action = await vscode.window.showErrorMessage(
        'Invalid access token. Please check your token and try again. You can get a valid token from usepromptr.com/account',
        'Enter New Token',
        'Get Token'
      );
      
      if (action === 'Enter New Token') {
        return await checkUserAccess(); // Recursive call to re-enter token
      } else if (action === 'Get Token') {
        vscode.env.openExternal(vscode.Uri.parse('https://usepromptr.com/account'));
      }
    }
    
    return false;
  }
}

/**
 * Manual token entry command
 */
export async function enterAccessTokenCommand(): Promise<void> {
  const token = await vscode.window.showInputBox({
    prompt: 'Enter your Promptr access token',
    placeHolder: 'Get your token from https://usepromptr.com/account',
    password: true,
    ignoreFocusOut: true
  });
  
  if (!token) {
    return;
  }
  
  // Validate the token immediately
  vscode.window.withProgress({
    location: vscode.ProgressLocation.Notification,
    title: "Validating Promptr token...",
    cancellable: false
  }, async () => {
    const result = await validateAccessToken(token);
    
    if (result.access) {
      await storeToken(token);
      await storeLastKnownStatus(result.status || 'unknown');
      vscode.window.showInformationMessage(
        `✅ Promptr token validated! Welcome ${result.user_email} (${result.status})`
      );
      
      // Trigger plan status refresh
      vscode.commands.executeCommand('promptr.refreshStatus');
    } else {
      vscode.window.showErrorMessage(
        'Invalid access token. Please check your token and try again. You can get a valid token from usepromptr.com/account'
      );
    }
  });
}

// Extension context storage
let extensionContext: vscode.ExtensionContext | undefined;

export function setExtensionContext(context: vscode.ExtensionContext) {
  extensionContext = context;
  console.log('[DEBUG] setExtensionContext called, context set:', !!context);
}

function getExtensionContext(): vscode.ExtensionContext | undefined {
  return extensionContext;
}

/**
 * Store token securely in VS Code's secret storage
 */
async function storeToken(token: string): Promise<void> {
  const context = getExtensionContext();
  if (context) {
    await context.secrets.store('promptr.accessToken', token);
  }
}

/**
 * Get stored token from VS Code's secret storage
 */
export async function getStoredToken(): Promise<string | undefined> {
  const context = getExtensionContext();
  if (context) {
    const token = await context.secrets.get('promptr.accessToken');
    console.log('[DEBUG] getStoredToken called, token:', token);
    return token;
  }
  console.log('[DEBUG] getStoredToken called, but context is undefined');
  return undefined;
}

/**
 * Clear stored token
 */
async function clearStoredToken(): Promise<void> {
  const context = getExtensionContext();
  if (context) {
    await context.secrets.delete('promptr.accessToken');
  }
}

/**
 * Store last known subscription status
 */
async function storeLastKnownStatus(status: string): Promise<void> {
  const context = getExtensionContext();
  if (context) {
    await context.globalState.update('promptr.lastStatus', status);
  }
}

/**
 * Get last known subscription status
 */
async function getLastKnownStatus(): Promise<string | undefined> {
  const context = getExtensionContext();
  if (context) {
    return context.globalState.get('promptr.lastStatus');
  }
  return undefined;
} 