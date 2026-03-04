import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useUser } from "@/hooks/use-user";
import { apiRequest } from "@/lib/queryClient";
import { MobileBottomNav } from "@/components/marketplace/MobileBottomNav";
import { 
  User, Phone, MapPin, QrCode, Settings, 
  CheckCircle2, XCircle, Edit2, Save, X, Globe,
  Store, Wallet, ShieldCheck
} from "lucide-react";

interface Country {
  id: number;
  name: string;
  code: string;
  dialCode: string;
}

interface City {
  id: number;
  name: string;
}

interface Neighborhood {
  id: number;
  name: string;
  latitude: string;
  longitude: string;
}

export default function UserProfilePage() {
  const { user, refetch: refetchUser } = useUser();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  const [isEditing, setIsEditing] = useState(false);
  const [editedData, setEditedData] = useState({
    displayName: user?.displayName || "",
    email: user?.email || "",
    phoneNumber: user?.phoneNumber || "",
    phoneCountryCode: user?.phoneCountryCode || "+1",
    language: user?.language || "en",
    timezone: user?.timezone || "UTC"
  });

  const { data: countries } = useQuery<Country[]>({
    queryKey: ['/api/locations/countries']
  });

  const updateUserMutation = useMutation({
    mutationFn: async (data: any) => {
      return await apiRequest('/api/user', {
        method: 'PATCH',
        body: JSON.stringify(data)
      });
    },
    onSuccess: () => {
      toast({
        title: "Profile updated",
        description: "Your profile has been updated successfully."
      });
      refetchUser();
      setIsEditing(false);
    },
    onError: (error: any) => {
      toast({
        title: "Update failed",
        description: error.message || "Failed to update profile",
        variant: "destructive"
      });
    }
  });

  const generateQRMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest(`/api/qr/user/${user?.id}`, {
        method: 'POST'
      });
    },
    onSuccess: () => {
      toast({
        title: "QR Code generated",
        description: "Your personal QR code has been created."
      });
      refetchUser();
    }
  });

  const handleSave = () => {
    updateUserMutation.mutate(editedData);
  };

  const handleCancel = () => {
    setEditedData({
      displayName: user?.displayName || "",
      email: user?.email || "",
      phoneNumber: user?.phoneNumber || "",
      phoneCountryCode: user?.phoneCountryCode || "+1",
      language: user?.language || "en",
      timezone: user?.timezone || "UTC"
    });
    setIsEditing(false);
  };

  const userInitials = user?.displayName
    ?.split(" ")
    .map(n => n[0])
    .join("")
    .toUpperCase() || "U";

  return (
    <div className="container mx-auto p-4 md:p-6 max-w-6xl pb-[calc(var(--bottom-stack-height)+20px)] md:pb-20">
      <div className="flex items-center gap-3 md:gap-4 mb-4 md:mb-6">
        <User className="h-6 w-6 md:h-8 md:w-8 text-blue-500" />
        <div>
          <h1 className="text-xl md:text-3xl font-bold text-white">User Profile</h1>
          <p className="text-gray-400 text-sm">Manage your account settings</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
        {/* Profile Overview Card */}
        <Card className="lg:col-span-1 bg-gray-900 border-gray-800">
          <CardHeader className="text-center p-4 md:p-6">
            <div className="flex justify-center mb-3 md:mb-4">
              <Avatar className="h-20 w-20 md:h-32 md:w-32 border-4 border-blue-600">
                <AvatarFallback className="bg-blue-600 text-white text-2xl md:text-4xl font-bold">
                  {userInitials}
                </AvatarFallback>
              </Avatar>
            </div>
            <CardTitle className="text-white text-lg md:text-2xl">{user?.displayName}</CardTitle>
            <CardDescription className="text-gray-400 text-sm truncate">{user?.email}</CardDescription>
            <div className="flex justify-center gap-2 mt-3 md:mt-4 flex-wrap">
              <Badge className="bg-blue-600 text-white text-xs">{user?.role}</Badge>
              {user?.phoneVerified && (
                <Badge className="bg-green-600 text-white text-xs">
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                  Verified
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="p-4 md:p-6 pt-0">
            <div className="space-y-2 md:space-y-3 text-xs md:text-sm">
              <div className="flex items-center gap-2 text-gray-400">
                <Globe className="h-4 w-4" />
                <span>{user?.language?.toUpperCase() || 'EN'} • {user?.timezone || 'UTC'}</span>
              </div>
              {user?.phoneNumber && (
                <div className="flex items-center gap-2 text-gray-400">
                  <Phone className="h-4 w-4" />
                  <span>{user.phoneNumber}</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Main Content */}
        <Card className="lg:col-span-2 bg-gray-900 border-gray-800">
          <CardHeader className="p-4 md:p-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <CardTitle className="text-white text-base md:text-lg">Profile Settings</CardTitle>
              {!isEditing ? (
                <Button onClick={() => setIsEditing(true)} variant="outline" size="sm" className="h-10 w-full sm:w-auto">
                  <Edit2 className="h-4 w-4 mr-2" />
                  Edit Profile
                </Button>
              ) : (
                <div className="flex gap-2 w-full sm:w-auto">
                  <Button onClick={handleSave} size="sm" disabled={updateUserMutation.isPending} className="h-10 flex-1 sm:flex-initial">
                    <Save className="h-4 w-4 mr-2" />
                    Save
                  </Button>
                  <Button onClick={handleCancel} variant="outline" size="sm" className="h-10 flex-1 sm:flex-initial">
                    <X className="h-4 w-4 mr-2" />
                    Cancel
                  </Button>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent className="p-4 md:p-6 pt-0">
            <Tabs defaultValue="basic" className="w-full">
              <TabsList className="grid w-full grid-cols-4 bg-gray-800 h-11">
                <TabsTrigger value="basic" className="text-[10px] sm:text-xs md:text-sm h-10">Basic</TabsTrigger>
                <TabsTrigger value="phone" className="text-[10px] sm:text-xs md:text-sm h-10">Phone</TabsTrigger>
                <TabsTrigger value="location" className="text-[10px] sm:text-xs md:text-sm h-10">Location</TabsTrigger>
                <TabsTrigger value="qr" className="text-[10px] sm:text-xs md:text-sm h-10">QR</TabsTrigger>
              </TabsList>

              {/* Basic Information Tab */}
              <TabsContent value="basic" className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label htmlFor="displayName" className="text-gray-300 text-sm">Display Name</Label>
                  <Input
                    id="displayName"
                    value={isEditing ? editedData.displayName : user?.displayName || ""}
                    onChange={(e) => setEditedData({ ...editedData, displayName: e.target.value })}
                    disabled={!isEditing}
                    className="bg-gray-800 border-gray-700 text-white h-11"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email" className="text-gray-300 text-sm">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={isEditing ? editedData.email : user?.email || ""}
                    onChange={(e) => setEditedData({ ...editedData, email: e.target.value })}
                    disabled={!isEditing}
                    className="bg-gray-800 border-gray-700 text-white h-11"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="phone" className="text-gray-300 text-sm">Phone Number</Label>
                  <div className="flex gap-2">
                    <Select
                      value={isEditing ? editedData.phoneCountryCode : user?.phoneCountryCode || "+1"}
                      onValueChange={(value) => setEditedData({ ...editedData, phoneCountryCode: value })}
                      disabled={!isEditing}
                    >
                      <SelectTrigger className="bg-gray-800 border-gray-700 text-white h-11 w-24">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-gray-800 border-gray-700">
                        <SelectItem value="+1">+1</SelectItem>
                        <SelectItem value="+44">+44</SelectItem>
                        <SelectItem value="+33">+33</SelectItem>
                        <SelectItem value="+49">+49</SelectItem>
                        <SelectItem value="+86">+86</SelectItem>
                        <SelectItem value="+91">+91</SelectItem>
                        <SelectItem value="+234">+234</SelectItem>
                        <SelectItem value="+27">+27</SelectItem>
                        <SelectItem value="+971">+971</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input
                      id="phone"
                      type="tel"
                      value={isEditing ? editedData.phoneNumber : user?.phoneNumber || ""}
                      onChange={(e) => setEditedData({ ...editedData, phoneNumber: e.target.value })}
                      disabled={!isEditing}
                      placeholder="Enter phone number"
                      className="bg-gray-800 border-gray-700 text-white h-11 flex-1"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="language" className="text-gray-300">Language</Label>
                    <Select
                      value={isEditing ? editedData.language : user?.language || "en"}
                      onValueChange={(value) => setEditedData({ ...editedData, language: value })}
                      disabled={!isEditing}
                    >
                      <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-gray-800 border-gray-700">
                        <SelectItem value="en">English</SelectItem>
                        <SelectItem value="es">Español</SelectItem>
                        <SelectItem value="fr">Français</SelectItem>
                        <SelectItem value="ar">العربية</SelectItem>
                        <SelectItem value="zh">中文</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="timezone" className="text-gray-300">Timezone</Label>
                    <Select
                      value={isEditing ? editedData.timezone : user?.timezone || "UTC"}
                      onValueChange={(value) => setEditedData({ ...editedData, timezone: value })}
                      disabled={!isEditing}
                    >
                      <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-gray-800 border-gray-700">
                        <SelectItem value="UTC">UTC</SelectItem>
                        <SelectItem value="America/New_York">Eastern Time</SelectItem>
                        <SelectItem value="America/Chicago">Central Time</SelectItem>
                        <SelectItem value="America/Los_Angeles">Pacific Time</SelectItem>
                        <SelectItem value="Europe/London">London</SelectItem>
                        <SelectItem value="Europe/Paris">Paris</SelectItem>
                        <SelectItem value="Asia/Dubai">Dubai</SelectItem>
                        <SelectItem value="Asia/Shanghai">Shanghai</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-gray-300">Account Type</Label>
                  <div className="p-3 bg-gray-800 rounded-md border border-gray-700">
                    <Badge className="bg-blue-600 text-white">{user?.accountType || "User"}</Badge>
                  </div>
                </div>
              </TabsContent>

              {/* Phone Verification Tab */}
              <TabsContent value="phone" className="space-y-4 mt-4">
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 bg-gray-800 rounded-lg border border-gray-700">
                    <div className="flex items-center gap-3">
                      <Phone className="h-5 w-5 text-blue-500" />
                      <div>
                        <div className="text-white font-medium">Phone Verification</div>
                        <div className="text-sm text-gray-400">
                          {user?.phoneVerified ? "Your phone number is verified" : "Phone not verified"}
                        </div>
                      </div>
                    </div>
                    {user?.phoneVerified ? (
                      <CheckCircle2 className="h-6 w-6 text-green-500" />
                    ) : (
                      <XCircle className="h-6 w-6 text-gray-500" />
                    )}
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="countryCode" className="text-gray-300">Country Code</Label>
                      <Select
                        value={isEditing ? editedData.phoneCountryCode : user?.phoneCountryCode || "+1"}
                        onValueChange={(value) => setEditedData({ ...editedData, phoneCountryCode: value })}
                        disabled={!isEditing}
                      >
                        <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-gray-800 border-gray-700">
                          {countries?.slice(0, 10).map((country) => (
                            <SelectItem key={country.id} value={country.dialCode}>
                              {country.dialCode} {country.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="col-span-2 space-y-2">
                      <Label htmlFor="phoneNumber" className="text-gray-300">Phone Number</Label>
                      <Input
                        id="phoneNumber"
                        type="tel"
                        value={isEditing ? editedData.phoneNumber : user?.phoneNumber || ""}
                        onChange={(e) => setEditedData({ ...editedData, phoneNumber: e.target.value })}
                        disabled={!isEditing}
                        placeholder="Enter phone number"
                        className="bg-gray-800 border-gray-700 text-white"
                      />
                    </div>
                  </div>

                  {user?.phoneVerifiedAt && (
                    <div className="text-sm text-gray-400">
                      Verified on {new Date(user.phoneVerifiedAt).toLocaleDateString()}
                    </div>
                  )}
                </div>
              </TabsContent>

              {/* Location Tab */}
              <TabsContent value="location" className="space-y-4 mt-4">
                <div className="flex items-center gap-2 p-4 bg-gray-800 rounded-lg border border-gray-700">
                  <MapPin className="h-5 w-5 text-blue-500" />
                  <div>
                    <div className="text-white font-medium">Location Settings</div>
                    <div className="text-sm text-gray-400">
                      {user?.neighborhoodId ? "Location set" : "No location configured"}
                    </div>
                  </div>
                </div>

                <div className="text-sm text-gray-400">
                  Location features coming soon - select your neighborhood for enhanced geolocation services.
                </div>
              </TabsContent>

              {/* QR Code Tab */}
              <TabsContent value="qr" className="space-y-4 mt-4">
                <div className="flex flex-col items-center justify-center gap-4 p-6">
                  {user?.qrCode ? (
                    <>
                      <div className="p-4 bg-white rounded-lg">
                        <img 
                          src={user.qrCode} 
                          alt="User QR Code" 
                          className="w-64 h-64"
                        />
                      </div>
                      <div className="text-center">
                        <div className="text-white font-medium">Your Personal QR Code</div>
                        <div className="text-sm text-gray-400">Share this code to connect</div>
                      </div>
                      <Button variant="outline" size="sm">
                        Download QR Code
                      </Button>
                    </>
                  ) : (
                    <>
                      <QrCode className="h-24 w-24 text-gray-600" />
                      <div className="text-center">
                        <div className="text-white font-medium">No QR Code Yet</div>
                        <div className="text-sm text-gray-400 mb-4">
                          Generate a personal QR code for your profile
                        </div>
                        <Button 
                          onClick={() => generateQRMutation.mutate()}
                          disabled={generateQRMutation.isPending}
                        >
                          <QrCode className="h-4 w-4 mr-2" />
                          Generate QR Code
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>

      <MobileBottomNav
        items={[
          {
            key: "browse",
            label: "Browse",
            icon: <Store className="h-4 w-4" />,
            onPress: () => navigate("/?mode=retail"),
          },
          {
            key: "map",
            label: "Map",
            icon: <MapPin className="h-4 w-4" />,
            onPress: () => navigate("/?panel=map"),
          },
          {
            key: "wallet",
            label: "Wallet",
            icon: <Wallet className="h-4 w-4" />,
            primary: true,
            onPress: () => navigate("/?panel=wallet"),
          },
          {
            key: "vault",
            label: "Vault",
            icon: <ShieldCheck className="h-4 w-4" />,
            onPress: () => navigate("/?panel=vault"),
          },
        ]}
      />
    </div>
  );
}
