const express = require('express');
require('dotenv').config();
const supabase = require('../config/supabaseClient');
const router = express.Router();
const accessControl = require('../middleware/middleware');
const fs = require('fs');
const path = require('path')
router.use(accessControl('admin'));
//Batch processing with promises and reducing queries sped this up 3x. Now feels almost instant. 
const multer = require('multer');
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });


router.get('/', async (req, res) => {
    // Assuming you've set up authentication and req.user is populated
    const tenantId = req.user.tenant_id; // Get tenant_id from the authenticated user
    try {
        let { data: services, error: servicesError } = await supabase
          .from('services')
          .select('*')
          .eq('tenant_id', tenantId);
      
        if (servicesError) throw servicesError;
      
        // Assuming service IDs are unique and can be mapped directly
        const serviceIds = services.map(service => service.id);
      
        // Fetch all service hours and add-ons in parallel
        const [hoursResult, addOnsResult] = await Promise.all([
          supabase
            .from('service_hours')
            .select('*')
            .in('service_id', serviceIds),
          supabase
            .from('service_add_ons')
            .select('*')
            .in('service_id', serviceIds)
        ]);
      
        // Map hours and add-ons back to their services
        services.forEach(service => {
          service.service_hours = hoursResult.data.filter(hour => hour.service_id === service.id);
          service.service_add_ons = addOnsResult.data.filter(addOn => addOn.service_id === service.id);
        });
      
        res.render('services', { services });
      } catch (error) {
        console.error('Failed to fetch services:', error.message);
        res.status(500).send('Server error');
      }      
});


router.get('/add-service', async (req, res) =>{
    res.render('services/add-service')
})

  
  router.post('/add-service', upload.single('service_image'),  async (req, res) => {
    // Now including tenant_id in the destructuring from req.body
    let { name, description, max_capacity, enabled, price, service_hours, service_add_ons, session_duration } = req.body;
    const tenant_id = req.user.tenant_id; 
    
    try {
        console.log(req.file);
        console.log('new service details', req.body)
        // Check if a service with the same name already exists
        const { data: existingService, error: existingServiceError } = await supabase
          .from('services')
          .select('id')
          .eq('name', name)
          .maybeSingle();
    
        if (existingServiceError) throw existingServiceError;
    
        // If a service with this name already exists, return an error response
        if (existingService) {
          return res.status(400).json({ error: "A service with this name already exists." });
        }
        
        let imagePath = '';
        if (req.file) {
            const imageFile = req.file;
            console.log('Buffer type:', Buffer.isBuffer(imageFile.buffer)); // Now should be true

            const fileName = imageFile.originalname;
            const { data: uploadData, error: uploadError } = await supabase
                .storage
                .from('flexiibook')
                .upload(`tenant_profiles/${fileName}`, imageFile.buffer, {
                    cacheControl: '3600',
                    upsert: false,
                    contentType: imageFile.mimetype // Set the content type explicitly
                });

            if (uploadError) throw uploadError;
            imagePath = `${process.env.SUPABASE_URL}/storage/v1/object/public/flexiibook/tenant_profiles/${fileName}`;
            console.log('Image uploaded to:', imagePath);
        }
    
        // Insert the new service since it doesn't exist yet
        const { data: serviceData, error: serviceError } = await supabase
          .from('services')
          .insert([{ tenant_id, name, description, max_capacity, enabled, price, session_duration, service_image: imagePath }])
          .select();
    
        if (serviceError) throw serviceError;
        if (!serviceData || serviceData.length === 0) throw new Error('Service creation failed or returned no data.');

        service_hours = service_hours.map(hour => ({
            ...hour,
            opening_time: hour.opening_time ? hour.opening_time : null,
            closing_time: hour.closing_time ? hour.closing_time : null,
            is_closed: hour.is_closed === 'true' // Convert "true" string to boolean true
          }));

        // Add each service hour to the 'service_hours' table
        const serviceHoursData = service_hours.map(hour => ({
            service_id: serviceData[0].id,
            day_of_week: hour.day_of_week,
            opening_time: hour.opening_time,
            closing_time: hour.closing_time,
            is_closed: hour.is_closed
        }));

        const { error: hoursError } = await supabase
            .from('service_hours')
            .insert(serviceHoursData);

        if (hoursError) throw hoursError;

    if (service_add_ons && service_add_ons.length > 0) {
      const serviceAddOnsData = service_add_ons.map(addOn => ({
        service_id: serviceData[0].id, // Assuming serviceData is an array with at least one item
        ...addOn
      }));

      const { error: addOnsError } = await supabase
        .from('service_add_ons')
        .insert(serviceAddOnsData);

      if (addOnsError) throw addOnsError;
    }

        // Redirect to /services on success
        console.log('success - service created')
        res.redirect('/services');
    } catch (error) {
        // Return JSON error if fails
        res.status(500).json({ error: error.message });
    }
});




//   Edit service route
router.get('/edit-service/:id', async (req, res) => {
    const serviceId = req.params.id; // Extract the ID from the route parameter
    console.log(req.params)
    try {
      // Fetch the specific service by ID
      let { data: service, error: serviceError } = await supabase
        .from('services')
        .select('*')
        .eq('id', serviceId)
        .single(); // Use .single() since you're fetching one by ID
  
      if (serviceError) throw serviceError;
  
      // Fetch the service hours for the specified service
      let { data: serviceHours, error: serviceHoursError } = await supabase
        .from('service_hours')
        .select('*')
        .eq('service_id', serviceId);
  
      if (serviceHoursError) throw serviceHoursError;
      service.service_hours = serviceHours; // Attach service hours to the service object
  
      // Fetch the service add-ons for the specified service
      let { data: serviceAddOns, error: serviceAddOnsError } = await supabase
        .from('service_add_ons')
        .select('*')
        .eq('service_id', serviceId);
  
      if (serviceAddOnsError) throw serviceAddOnsError;
      service.service_add_ons = serviceAddOns; // Attach service add-ons to the service object
  
      // Render the EJS template for editing a single service and pass the service data
      res.render('services/edit-service', { service }); // Note the change here to pass a single service object
    } catch (error) {
      console.error('Failed to fetch service details:', error.message);
      res.status(500).send('Server error');
    }
});


  // Upate
  router.post('/edit-service/:id', async (req, res) => {
    const serviceId = req.params.id;
    let { name, description, max_capacity, enabled, price, service_hours, service_add_ons, session_duration } = req.body;
  
    enabled = enabled === 'true'; // Convert to boolean
  
    try {
      console.log('Edit service route:', req.body);
  
      // Update the main service details
      const { error: updateServiceError } = await supabase
        .from('services')
        .update({ name, description, max_capacity, enabled, price })
        .match({ id: serviceId });
      if (updateServiceError) throw updateServiceError;
  
      // Handle service hours
      // Delete existing hours
      const { error: deleteHoursError } = await supabase
        .from('service_hours')
        .delete()
        .match({ service_id: serviceId });
      if (deleteHoursError) throw deleteHoursError;
  
      // Ensure `service_hours` is properly processed
      if (Array.isArray(service_hours) && service_hours.length > 0) {
      // Ensure each hour has a correct `is_closed` boolean value
      const hoursData = service_hours.map(hour => {
        return {
          ...hour,
          service_id: serviceId,
          opening_time: hour.opening_time || null,
          closing_time: hour.closing_time || null,
          is_closed: hour.is_closed === 'true', // Explicitly check for 'true'
        };
      });
      
        // Insert or update the service_hours data into your database
        const { error: insertHoursError } = await supabase
          .from('service_hours')
          .insert(hoursData);
      
        if (insertHoursError) throw insertHoursError;
      }
      
  
      res.redirect(`/services`);
    } catch (error) {
      console.error('Failed to update service:', error.message);
      res.status(500).json({ error: error.message });
    }
  });
  

  router.get('/edit-add-ons/:id', async (req, res) => {
    const addOnId = req.params.id;
    const serviceId = req.query.serviceId;  // Retrieve serviceId from query parameters

    try {
        // Fetch the specific add-on details from Supabase
        const { data: addOn, error } = await supabase
            .from('service_add_ons')
            .select('*')
            .eq('id', addOnId)
            .single();

        if (error) {
            throw error;
        }

        // Render the edit form with the fetched add-on data and serviceId
        res.render('services/edit-add-ons', { addOn, serviceId });
    } catch (error) {
        console.error('Failed to fetch add-on:', error.message);
        res.status(500).send('Error fetching add-on details');
    }
});


router.post('/edit-add-ons/:id', async (req, res) => {
  const addOnId = req.params.id;
  const { name, description, price, max_quantity, active, serviceId } = req.body; // Include serviceId in the body

  try {
      // Update the add-on details
      const { error: updateAddOnError } = await supabase
          .from('service_add_ons')
          .update({ name, description, price, max_quantity, active })
          .match({ id: addOnId });

      if (updateAddOnError) throw updateAddOnError;

      // Redirect back to the service details page using the serviceId
      res.redirect(`/services/edit-service/${serviceId}`);
  } catch (error) {
      console.error('Failed to update add-on:', error.message);
      res.status(500).json({ error: error.message });
  }
});


router.get('/create-add-on/:serviceId', (req, res) => {
  const serviceId = req.params.serviceId;
  res.render('services/create-add-on', { serviceId });
});


router.post('/add-add-on', async (req, res) => {
  const { serviceId, name, description, price, maxQuantity, active } = req.body;

  try {
      // Insert new add-on details into the service_add_ons table
      const { data: newAddOn, error } = await supabase
          .from('service_add_ons')
          .insert([{
              service_id: serviceId,
              name: name,
              description: description,
              price: price,
              max_quantity: maxQuantity,
              active: active
          }]);

      if (error) {
          throw error;
      }

      res.redirect(`/services/edit-service/${serviceId}`);
  } catch (error) {
      console.error('Failed to add new add-on:', error.message);
      res.status(500).send('Error adding new add-on');
  }
});



      // // Fetch existing add-ons
      // const { data: existingAddOns, error: fetchError } = await supabase
      //   .from('service_add_ons')
      //   .select('*')
      //   .eq('service_id', serviceId);
      // if (fetchError) throw fetchError;
  
      // const incomingIds = service_add_ons.map(addOn => addOn.id).filter(id => id);
      // const toDeactivate = existingAddOns.filter(addOn => !incomingIds.includes(addOn.id));
  
      // // Mark as inactive add-ons that are not in the incoming list and have bookings
      // if (toDeactivate.length > 0) {
      //   const { error: deactivateError } = await supabase
      //     .from('service_add_ons')
      //     .update({ active: false })
      //     .in('id', toDeactivate.map(addOn => addOn.id));
      //   if (deactivateError) throw deactivateError;
      // }
  
      // // Insert or update add-ons
      // for (const addOn of service_add_ons) {
      //   if (addOn.id) {
      //     // Update existing add-on
      //     const { error: updateError } = await supabase
      //       .from('service_add_ons')
      //       .update(addOn)
      //       .eq('id', addOn.id);
      //     if (updateError) throw updateError;
      //   } else {
      //     // Insert new add-on
      //     const { error: insertError } = await supabase
      //       .from('service_add_ons')
      //       .insert({
      //         ...addOn,
      //         service_id: serviceId,
      //         active: true  // Make sure new add-ons are marked as active
      //       });
      //     if (insertError) throw insertError;
      //   }
      // }

  // router.post('/edit-service/:id', async (req, res) => {
  //   const serviceId = req.params.id;
  //   let { name, description, max_capacity, enable, price, service_hours } = req.body;
  
  //   try {
  //     // Update the main service details
  //     const { error: updateServiceError } = await supabase
  //       .from('services')
  //       .update({ name, description, max_capacity, enable, price })
  //       .match({ id: serviceId });
  //     if (updateServiceError) throw updateServiceError;
  
  //     // Handle service hours
  //     // Delete existing hours
  //     const { error: deleteHoursError } = await supabase
  //       .from('service_hours')
  //       .delete()
  //       .match({ service_id: serviceId });
  //     if (deleteHoursError) throw deleteHoursError;
  
  //     // Insert new hours if provided
  //     if (service_hours && service_hours.length > 0) {
  //       const hoursData = service_hours.map(hour => ({
  //         service_id: serviceId,
  //         opening_time: hour.opening_time ? hour.opening_time : null,
  //         closing_time: hour.closing_time ? hour.closing_time : null,
  //         is_closed: hour.is_closed === 'true'
  //       }));
  //       const { error: insertHoursError } = await supabase
  //         .from('service_hours')
  //         .insert(hoursData);
  //       if (insertHoursError) throw insertHoursError;
  //     }
  
  //     res.send('Service updated successfully');
  //   } catch (error) {
  //     console.error('Failed to update service:', error.message);
  //     res.status(500).json({ error: error.message });
  //   }
  // });
  
  
  

  router.delete('/delete-service/:id', async (req, res) => {
    const serviceId = req.params.id;
  
    try {
      // First, delete the related service hours to avoid foreign key constraint violations
      const { error: deleteHoursError } = await supabase
        .from('service_hours')
        .delete()
        .match({ service_id: serviceId });
      if (deleteHoursError) throw deleteHoursError;
  
      // Then, delete the related service add-ons
      const { error: deleteAddOnsError } = await supabase
        .from('service_add_ons')
        .delete()
        .match({ service_id: serviceId });
      if (deleteAddOnsError) throw deleteAddOnsError;
  
      // After successfully removing the dependencies, delete the service itself
      const { error: deleteServiceError } = await supabase
        .from('services')
        .delete()
        .match({ id: serviceId });
      if (deleteServiceError) throw deleteServiceError;
  
      // Respond with success
      res.json({ message: 'Service and its associated hours and add-ons have been successfully deleted.' });
    } catch (error) {
      console.error('Failed to delete service:', error.message);
      res.status(500).json({ error: error.message });
    }
  });
  

// FETCH ADD ONS FOR SERVICES  //
router.get('/:serviceId/add-ons', async (req, res) => {
    const { serviceId } = req.params;
    try {
        const { data: addOns, error } = await supabase
            .from('service_add_ons')
            .select('*')
            .eq('service_id', serviceId);
        
        if (error) throw error;
        
        res.json(addOns);
    } catch (error) {
        console.error('Failed to fetch add-ons:', error.message);
        res.status(500).json({ error: 'Failed to fetch add-ons' });
    }
});

// FETCHC TIME SLOTS FOR SERVICES  //
router.get('/:serviceId/time-slots', async (req, res) => {
  const { serviceId } = req.params;
  try {
      const { data: timeSlots, error } = await supabase
          .from('service_hours')
          .select('*')
          .eq('service_id', serviceId);
      
      if (error) throw error;
      
      res.json(timeSlots);
  } catch (error) {
      console.error('Failed to fetch timeSlots:', error.message);
      res.status(500).json({ error: 'Failed to fetch timeSlots' });
  }
});



  

module.exports = router;