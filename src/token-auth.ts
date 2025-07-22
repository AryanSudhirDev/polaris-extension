import * as vscode from 'vscode';

export interface TokenValidationResponse {
  access: boolean;
  status?: 'trialing' | 'active' | 'inactive';
  user_email?: string;
  message?: string;
}

/**
 * Validates a Promptr access token against the backend
 */
export async function validateAccessToken(token: string): Promise<TokenValidationResponse> {
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